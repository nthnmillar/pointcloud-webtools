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
    float voxelSize
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

    // TODO: Implement your voxel downsampling algorithm here
    // 
    // Basic approach:
    // 1. Create a 3D grid based on voxelSize
    // 2. Group points by voxel coordinates
    // 3. For each voxel, keep one representative point (e.g., average)
    // 4. Return the downsampled points
    
    // Placeholder implementation - just return every 10th point
    std::vector<Point3D> result;
    for (size_t i = 0; i < points.size(); i += 10) {
        result.push_back(points[i]);
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

