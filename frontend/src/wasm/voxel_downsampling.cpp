#include <vector>
#include <unordered_map>
#include <cmath>
#include <emscripten/bind.h>
#include <emscripten/val.h>

struct Point3D {
    float x, y, z;
    // Add other attributes as needed (color, intensity, etc.)
    Point3D(float x = 0, float y = 0, float z = 0) : x(x), y(y), z(z) {}
};

// Voxel downsampling function that accepts Float32Array
std::vector<Point3D> voxelDownsample(
    const emscripten::val& inputPoints, 
    float voxelSize,
    float globalMinX = 0.0f,
    float globalMinY = 0.0f,
    float globalMinZ = 0.0f
) {
    // Convert JavaScript Float32Array to C++ vector
    std::vector<Point3D> points;
    
    if (inputPoints.isNull() || inputPoints.isUndefined() || voxelSize <= 0) {
        return points;
    }
    
    // Get the Float32Array data
    int length = inputPoints["length"].as<int>();
    
    // Convert every 3 elements to a Point3D using call method
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

    // Real voxel downsampling - group points by 3D voxel and average
    std::unordered_map<std::string, std::vector<Point3D>> voxelMap;
    
    // Group points by voxel coordinates
    for (const auto& point : points) {
        // Calculate voxel coordinates using global bounds
        int voxelX = static_cast<int>((point.x - globalMinX) / voxelSize);
        int voxelY = static_cast<int>((point.y - globalMinY) / voxelSize);
        int voxelZ = static_cast<int>((point.z - globalMinZ) / voxelSize);
        
        // Create voxel key
        std::string voxelKey = std::to_string(voxelX) + "," + 
                              std::to_string(voxelY) + "," + 
                              std::to_string(voxelZ);
        
        voxelMap[voxelKey].push_back(point);
    }
    
    // Average points within each voxel
    std::vector<Point3D> result;
    for (const auto& [voxelKey, voxelPoints] : voxelMap) {
        if (voxelPoints.empty()) continue;
        
        // Calculate average point for this voxel
        float avgX = 0, avgY = 0, avgZ = 0;
        for (const auto& point : voxelPoints) {
            avgX += point.x;
            avgY += point.y;
            avgZ += point.z;
        }
        
        avgX /= voxelPoints.size();
        avgY /= voxelPoints.size();
        avgZ /= voxelPoints.size();
        
        result.push_back({avgX, avgY, avgZ});
    }
    
    return result;
}

// Emscripten bindings
EMSCRIPTEN_BINDINGS(voxel_module) {
    emscripten::value_object<Point3D>("Point3D")
        .field("x", &Point3D::x)
        .field("y", &Point3D::y)
        .field("z", &Point3D::z);
    
    emscripten::register_vector<Point3D>("Point3DVector");
    
    emscripten::function("voxelDownsample", &voxelDownsample);
}

