#include <vector>
#include <unordered_map>
#include <cmath>
#include <emscripten/bind.h>
#include <emscripten/val.h>

struct Point3D {
    float x, y, z;
    Point3D(float x = 0, float y = 0, float z = 0) : x(x), y(y), z(z) {}
};

// Voxel downsampling function
std::vector<Point3D> voxelDownsample(
    const emscripten::val& inputPoints, 
    float voxelSize,
    float globalMinX = 0.0f,
    float globalMinY = 0.0f,
    float globalMinZ = 0.0f
) {
    std::vector<Point3D> points;
    
    if (inputPoints.isNull() || inputPoints.isUndefined() || voxelSize <= 0) {
        return points;
    }
    
    int length = inputPoints["length"].as<int>();
    
    for (int i = 0; i < length; i += 3) {
        if (i + 2 < length) {
            float x = inputPoints.call<float>("at", i);
            float y = inputPoints.call<float>("at", i + 1);
            float z = inputPoints.call<float>("at", i + 2);
            points.push_back(Point3D(x, y, z));
        }
    }
    
    if (points.empty()) {
        return points;
    }

    // Debug: Calculate actual bounds
    float minX = points[0].x, maxX = points[0].x;
    float minY = points[0].y, maxY = points[0].y;
    float minZ = points[0].z, maxZ = points[0].z;
    
    for (const auto& point : points) {
        minX = std::min(minX, point.x);
        maxX = std::max(maxX, point.x);
        minY = std::min(minY, point.y);
        maxY = std::max(maxY, point.y);
        minZ = std::min(minZ, point.z);
        maxZ = std::max(maxZ, point.z);
    }
    
    // Debug: Log bounds and voxel size
    printf("DEBUG: Point cloud bounds: [%.3f, %.3f] x [%.3f, %.3f] x [%.3f, %.3f]\n", 
           minX, maxX, minY, maxY, minZ, maxZ);
    printf("DEBUG: Voxel size: %.3f\n", voxelSize);
    printf("DEBUG: Global bounds: [%.3f, %.3f] x [%.3f, %.3f] x [%.3f, %.3f]\n", 
           globalMinX, globalMinX + (maxX - minX), 
           globalMinY, globalMinY + (maxY - minY), 
           globalMinZ, globalMinZ + (maxZ - minZ));

    // Use efficient sum/count approach like TS/BE implementations
    struct Voxel {
        int count;
        float sumX, sumY, sumZ;
        Voxel() : count(0), sumX(0), sumY(0), sumZ(0) {}
    };
    
    std::unordered_map<std::string, Voxel> voxelMap;
    
    for (const auto& point : points) {
        int voxelX = static_cast<int>((point.x - globalMinX) / voxelSize);
        int voxelY = static_cast<int>((point.y - globalMinY) / voxelSize);
        int voxelZ = static_cast<int>((point.z - globalMinZ) / voxelSize);
        
        std::string voxelKey = std::to_string(voxelX) + "," + 
                              std::to_string(voxelY) + "," + 
                              std::to_string(voxelZ);
        
        if (voxelMap.find(voxelKey) != voxelMap.end()) {
            Voxel& voxel = voxelMap[voxelKey];
            voxel.count++;
            voxel.sumX += point.x;
            voxel.sumY += point.y;
            voxel.sumZ += point.z;
        } else {
            Voxel voxel;
            voxel.count = 1;
            voxel.sumX = point.x;
            voxel.sumY = point.y;
            voxel.sumZ = point.z;
            voxelMap[voxelKey] = voxel;
        }
    }
    
    printf("DEBUG: Created %zu voxels\n", voxelMap.size());
    
    std::vector<Point3D> result;
    for (const auto& [voxelKey, voxel] : voxelMap) {
        // Calculate average position (voxel center) - same as TS/BE
        float avgX = voxel.sumX / voxel.count;
        float avgY = voxel.sumY / voxel.count;
        float avgZ = voxel.sumZ / voxel.count;
        
        result.push_back({avgX, avgY, avgZ});
    }
    
    printf("DEBUG: Returning %zu downsampled points\n", result.size());
    return result;
}

// Point cloud smoothing function
emscripten::val pointCloudSmoothing(
    const emscripten::val& inputPoints, 
    float smoothingRadius = 0.5f,
    int iterations = 3
) {
    std::vector<Point3D> points;
    
    if (inputPoints.isNull() || inputPoints.isUndefined() || smoothingRadius <= 0 || iterations <= 0) {
        return emscripten::val::array();
    }
    
    int length = inputPoints["length"].as<int>();
    
    for (int i = 0; i < length; i += 3) {
        if (i + 2 < length) {
            float x = inputPoints.call<float>("at", i);
            float y = inputPoints.call<float>("at", i + 1);
            float z = inputPoints.call<float>("at", i + 2);
            points.push_back(Point3D(x, y, z));
        }
    }
    
    if (points.empty()) {
        return emscripten::val::array();
    }

    std::vector<Point3D> smoothedPoints = points;
    
    for (int iter = 0; iter < iterations; iter++) {
        std::vector<Point3D> tempPoints = smoothedPoints;
        
        for (size_t i = 0; i < smoothedPoints.size(); i++) {
            const Point3D& currentPoint = smoothedPoints[i];
            float sumX = 0, sumY = 0, sumZ = 0;
            int count = 0;
            
            for (size_t j = 0; j < smoothedPoints.size(); j++) {
                if (i == j) continue;
                
                const Point3D& neighborPoint = smoothedPoints[j];
                float dx = neighborPoint.x - currentPoint.x;
                float dy = neighborPoint.y - currentPoint.y;
                float dz = neighborPoint.z - currentPoint.z;
                float distance = std::sqrt(dx * dx + dy * dy + dz * dz);
                
                if (distance <= smoothingRadius) {
                    sumX += neighborPoint.x;
                    sumY += neighborPoint.y;
                    sumZ += neighborPoint.z;
                    count++;
                }
            }
            
            if (count > 0) {
                tempPoints[i] = Point3D(
                    (currentPoint.x + sumX) / (count + 1),
                    (currentPoint.y + sumY) / (count + 1),
                    (currentPoint.z + sumZ) / (count + 1)
                );
            }
        }
        
        smoothedPoints = tempPoints;
    }
    
    int resultLength = smoothedPoints.size() * 3;
    emscripten::val result = emscripten::val::global("Float32Array").new_(resultLength);
    
    for (size_t i = 0; i < smoothedPoints.size(); i++) {
        result.set(i * 3, smoothedPoints[i].x);
        result.set(i * 3 + 1, smoothedPoints[i].y);
        result.set(i * 3 + 2, smoothedPoints[i].z);
    }
    
    return result;
}

// Debug visualization data structures
struct VoxelDebug {
    std::vector<Point3D> voxelCenters;
    float voxelSize;
    bool isVisible;
};

static VoxelDebug g_voxelDebug;

// Debug visualization functions
void showVoxelDebug(const emscripten::val& points, float voxelSize) {
    g_voxelDebug.voxelCenters.clear();
    g_voxelDebug.voxelSize = voxelSize;
    g_voxelDebug.isVisible = true;

    std::vector<Point3D> pointVec;
    int length = points["length"].as<int>();
    
    for (int i = 0; i < length; i += 3) {
        if (i + 2 < length) {
            float x = points.call<float>("at", i);
            float y = points.call<float>("at", i + 1);
            float z = points.call<float>("at", i + 2);
            pointVec.push_back(Point3D(x, y, z));
        }
    }

    std::unordered_map<std::string, Point3D> voxelCenters;
    for (const auto& point : pointVec) {
        int voxelX = static_cast<int>(point.x / voxelSize);
        int voxelY = static_cast<int>(point.y / voxelSize);
        int voxelZ = static_cast<int>(point.z / voxelSize);
        
        std::string voxelKey = std::to_string(voxelX) + "," + 
                              std::to_string(voxelY) + "," + 
                              std::to_string(voxelZ);
        
        voxelCenters[voxelKey] = Point3D(
            (voxelX + 0.5f) * voxelSize,
            (voxelY + 0.5f) * voxelSize,
            (voxelZ + 0.5f) * voxelSize
        );
    }

    for (const auto& [key, center] : voxelCenters) {
        g_voxelDebug.voxelCenters.push_back(center);
    }
}

void hideVoxelDebug() {
    g_voxelDebug.isVisible = false;
    g_voxelDebug.voxelCenters.clear();
}

emscripten::val getVoxelDebugCenters() {
    if (!g_voxelDebug.isVisible || g_voxelDebug.voxelCenters.empty()) {
        return emscripten::val::array();
    }

    int resultLength = g_voxelDebug.voxelCenters.size() * 3;
    emscripten::val result = emscripten::val::global("Float32Array").new_(resultLength);
    
    for (size_t i = 0; i < g_voxelDebug.voxelCenters.size(); i++) {
        result.set(i * 3, g_voxelDebug.voxelCenters[i].x);
        result.set(i * 3 + 1, g_voxelDebug.voxelCenters[i].y);
        result.set(i * 3 + 2, g_voxelDebug.voxelCenters[i].z);
    }
    
    return result;
}

float getVoxelDebugSize() {
    return g_voxelDebug.voxelSize;
}

bool isVoxelDebugVisible() {
    return g_voxelDebug.isVisible;
}

// Emscripten bindings
EMSCRIPTEN_BINDINGS(tools_module) {
    emscripten::value_object<Point3D>("Point3D")
        .field("x", &Point3D::x)
        .field("y", &Point3D::y)
        .field("z", &Point3D::z);
    
    emscripten::register_vector<Point3D>("Point3DVector");
    
    emscripten::function("voxelDownsample", &voxelDownsample);
    emscripten::function("pointCloudSmoothing", &pointCloudSmoothing);
    emscripten::function("showVoxelDebug", &showVoxelDebug);
    emscripten::function("hideVoxelDebug", &hideVoxelDebug);
    emscripten::function("getVoxelDebugCenters", &getVoxelDebugCenters);
    emscripten::function("getVoxelDebugSize", &getVoxelDebugSize);
    emscripten::function("isVoxelDebugVisible", &isVoxelDebugVisible);
}

