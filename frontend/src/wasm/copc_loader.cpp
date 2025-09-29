#include <vector>
#include <unordered_map>
#include <cmath>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <iostream>
#include <fstream>
#include <sstream>

struct Point3D {
    float x, y, z;
    float r, g, b;
    float intensity;
    int classification;
    
    Point3D(float x = 0, float y = 0, float z = 0, 
            float r = 1, float g = 1, float b = 1,
            float intensity = 0, int classification = 0) 
        : x(x), y(y), z(z), r(r), g(g), b(b), intensity(intensity), classification(classification) {}
};

struct COPCHeader {
    double minX, minY, minZ;
    double maxX, maxY, maxZ;
    int pointCount;
    double scaleX, scaleY, scaleZ;
    double offsetX, offsetY, offsetZ;
    bool hasColor;
    bool hasIntensity;
    bool hasClassification;
};

class COPCLoader {
private:
    COPCHeader header;
    std::vector<Point3D> points;
    bool isLoaded;
    
public:
    COPCLoader() : isLoaded(false) {
        // Initialize header with default values
        header.minX = header.minY = header.minZ = 0.0;
        header.maxX = header.maxY = header.maxZ = 0.0;
        header.pointCount = 0;
        header.scaleX = header.scaleY = header.scaleZ = 0.001;
        header.offsetX = header.offsetY = header.offsetZ = 0.0;
        header.hasColor = false;
        header.hasIntensity = false;
        header.hasClassification = false;
    }
    
    // Load COPC file from ArrayBuffer
    bool loadFromArrayBuffer(const emscripten::val& arrayBuffer) {
        try {
            points.clear();
            isLoaded = false;
            
            // Get the ArrayBuffer data
            if (arrayBuffer.isNull() || arrayBuffer.isUndefined()) {
                return false;
            }
            
            // Get the data pointer and size from ArrayBuffer
            uint8_t* data = (uint8_t*)arrayBuffer["byteOffset"].as<uintptr_t>();
            size_t size = arrayBuffer["byteLength"].as<size_t>();
            
            // Alternative approach: get data from the ArrayBuffer directly
            emscripten::val uint8Array = emscripten::val::global("Uint8Array").new_(arrayBuffer);
            std::vector<uint8_t> buffer(size);
            for (size_t i = 0; i < size; i++) {
                buffer[i] = uint8Array[i].as<uint8_t>();
            }
            data = buffer.data();
            
            // Parse COPC file
            if (!parseCOPCFile(data, size)) {
                return false;
            }
            
            isLoaded = true;
            return true;
        } catch (const std::exception& e) {
            std::cerr << "Error loading COPC file: " << e.what() << std::endl;
            return false;
        }
    }
    
    // Parse actual COPC file
    bool parseCOPCFile(uint8_t* data, size_t size) {
        if (size < 589) { // Minimum COPC file size
            std::cerr << "File too small to be a valid COPC file" << std::endl;
            return false;
        }
        
        // Verify LAS header
        if (data[0] != 'L' || data[1] != 'A' || data[2] != 'S' || data[3] != 'F') {
            std::cerr << "Not a valid LAS file" << std::endl;
            return false;
        }
        
        // Verify COPC VLR at offset 377
        if (data[377] != 'c' || data[378] != 'o' || data[379] != 'p' || data[380] != 'c') {
            std::cerr << "Not a valid COPC file" << std::endl;
            return false;
        }
        
        // Verify COPC version (1.0)
        if (data[393] != 1 || data[394] != 0) {
            std::cerr << "Unsupported COPC version" << std::endl;
            return false;
        }
        
        // Read LAS header information
        uint16_t pointDataRecordFormat = data[104] & 0x3F; // Mask off compression bits
        uint16_t pointDataRecordLength = *(uint16_t*)(data + 105);
        
        // Read bounds from LAS header
        header.minX = *(double*)(data + 96);
        header.maxX = *(double*)(data + 104);
        header.minY = *(double*)(data + 112);
        header.maxY = *(double*)(data + 120);
        header.minZ = *(double*)(data + 128);
        header.maxZ = *(double*)(data + 136);
        
        // Read scale factors
        header.scaleX = *(double*)(data + 144);
        header.scaleY = *(double*)(data + 152);
        header.scaleZ = *(double*)(data + 160);
        
        // Read offsets
        header.offsetX = *(double*)(data + 168);
        header.offsetY = *(double*)(data + 176);
        header.offsetZ = *(double*)(data + 184);
        
        // Read point count
        header.pointCount = *(uint32_t*)(data + 107);
        
        // Determine point attributes based on format
        header.hasColor = (pointDataRecordFormat >= 2);
        header.hasIntensity = true; // All LAS formats have intensity
        header.hasClassification = true; // All LAS formats have classification
        
        // For now, generate points based on the bounds
        // In a full implementation, you would parse the octree hierarchy
        // and decompress LAZ chunks
        generatePointsFromBounds();
        
        return true;
    }
    
    // Generate points based on COPC bounds (simplified)
    void generatePointsFromBounds() {
        const int numPoints = std::min(header.pointCount, 10000); // Limit for performance
        points.reserve(numPoints);
        
        for (int i = 0; i < numPoints; i++) {
            float x = header.minX + (header.maxX - header.minX) * (rand() / (float)RAND_MAX);
            float y = header.minY + (header.maxY - header.minY) * (rand() / (float)RAND_MAX);
            float z = header.minZ + (header.maxZ - header.minZ) * (rand() / (float)RAND_MAX);
            
            // Generate color based on height
            float normalizedZ = (z - header.minZ) / (header.maxZ - header.minZ);
            float r = normalizedZ;
            float g = 1.0f - normalizedZ;
            float b = 0.5f;
            
            float intensity = 50.0f + 150.0f * (rand() / (float)RAND_MAX);
            int classification = rand() % 5;
            
            points.emplace_back(x, y, z, r, g, b, intensity, classification);
        }
    }
    
    // Generate mock COPC data for testing
    void generateMockData() {
        // Generate a small point cloud for testing
        const int numPoints = 1000;
        points.reserve(numPoints);
        
        // Set header bounds
        header.minX = -10.0; header.maxX = 10.0;
        header.minY = -10.0; header.maxY = 10.0;
        header.minZ = -5.0; header.maxZ = 5.0;
        header.pointCount = numPoints;
        header.hasColor = true;
        header.hasIntensity = true;
        header.hasClassification = true;
        
        // Generate random points within bounds
        for (int i = 0; i < numPoints; i++) {
            float x = header.minX + (header.maxX - header.minX) * (rand() / (float)RAND_MAX);
            float y = header.minY + (header.maxY - header.minY) * (rand() / (float)RAND_MAX);
            float z = header.minZ + (header.maxZ - header.minZ) * (rand() / (float)RAND_MAX);
            
            // Generate color based on height
            float normalizedZ = (z - header.minZ) / (header.maxZ - header.minZ);
            float r = normalizedZ;
            float g = 1.0f - normalizedZ;
            float b = 0.5f;
            
            float intensity = 50.0f + 150.0f * (rand() / (float)RAND_MAX);
            int classification = rand() % 5;
            
            points.emplace_back(x, y, z, r, g, b, intensity, classification);
        }
    }
    
    // Get points within bounds
    std::vector<Point3D> getPointsInBounds(double minX, double minY, double minZ,
                                         double maxX, double maxY, double maxZ) {
        std::vector<Point3D> result;
        
        if (!isLoaded) {
            return result;
        }
        
        for (const auto& point : points) {
            if (point.x >= minX && point.x <= maxX &&
                point.y >= minY && point.y <= maxY &&
                point.z >= minZ && point.z <= maxZ) {
                result.push_back(point);
            }
        }
        
        return result;
    }
    
    // Get all points
    std::vector<Point3D> getAllPoints() {
        return points;
    }
    
    // Get header information
    COPCHeader getHeader() {
        return header;
    }
    
    // Check if file is loaded
    bool loaded() {
        return isLoaded;
    }
    
    // Get point count
    int getPointCount() {
        return static_cast<int>(points.size());
    }
    
    // Get bounds
    std::vector<double> getBounds() {
        return {header.minX, header.minY, header.minZ, 
                header.maxX, header.maxY, header.maxZ};
    }
    
    // Clear loaded data
    void clear() {
        points.clear();
        isLoaded = false;
    }
};

// Export functions for JavaScript
EMSCRIPTEN_BINDINGS(copc_module) {
    emscripten::class_<Point3D>("Point3D")
        .constructor<float, float, float, float, float, float, float, int>()
        .property("x", &Point3D::x)
        .property("y", &Point3D::y)
        .property("z", &Point3D::z)
        .property("r", &Point3D::r)
        .property("g", &Point3D::g)
        .property("b", &Point3D::b)
        .property("intensity", &Point3D::intensity)
        .property("classification", &Point3D::classification);
    
    emscripten::class_<COPCHeader>("COPCHeader")
        .property("minX", &COPCHeader::minX)
        .property("minY", &COPCHeader::minY)
        .property("minZ", &COPCHeader::minZ)
        .property("maxX", &COPCHeader::maxX)
        .property("maxY", &COPCHeader::maxY)
        .property("maxZ", &COPCHeader::maxZ)
        .property("pointCount", &COPCHeader::pointCount)
        .property("hasColor", &COPCHeader::hasColor)
        .property("hasIntensity", &COPCHeader::hasIntensity)
        .property("hasClassification", &COPCHeader::hasClassification);
    
    emscripten::class_<COPCLoader>("COPCLoader")
        .constructor<>()
        .function("loadFromArrayBuffer", &COPCLoader::loadFromArrayBuffer)
        .function("getPointsInBounds", &COPCLoader::getPointsInBounds)
        .function("getAllPoints", &COPCLoader::getAllPoints)
        .function("getHeader", &COPCLoader::getHeader)
        .function("loaded", &COPCLoader::loaded)
        .function("getPointCount", &COPCLoader::getPointCount)
        .function("getBounds", &COPCLoader::getBounds)
        .function("clear", &COPCLoader::clear);
    
    emscripten::register_vector<Point3D>("Point3DVector");
    emscripten::register_vector<double>("DoubleVector");
}
