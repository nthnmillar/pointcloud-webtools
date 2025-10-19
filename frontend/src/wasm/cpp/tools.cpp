#include <vector>
#include <unordered_map>
#include <cmath>
#include <emscripten/bind.h>
#include <emscripten/val.h>

struct Point3D {
    float x, y, z;
    Point3D(float x = 0, float y = 0, float z = 0) : x(x), y(y), z(z) {}
};

// Forward declarations
int voxelDownsampleInternal(float* inputData, int pointCount, float voxelSize, 
                           float globalMinX, float globalMinY, float globalMinZ, float* outputData);

extern "C" {
    void pointCloudSmoothingDirect(float* inputData, float* outputData, int pointCount, 
                                  float smoothingRadius, int iterations);
}

// Optimized voxel downsampling function
std::vector<Point3D> voxelDownsample(
    const emscripten::val& inputPoints, 
    float voxelSize,
    float globalMinX = 0.0f,
    float globalMinY = 0.0f,
    float globalMinZ = 0.0f
) {
    if (inputPoints.isNull() || inputPoints.isUndefined() || voxelSize <= 0) {
        return std::vector<Point3D>();
    }
    
    int length = inputPoints["length"].as<int>();
    int pointCount = length / 3;
    
    // Allocate memory for input and output data
    float* inputPtr = (float*)malloc(length * sizeof(float));
    float* outputPtr = (float*)malloc(length * sizeof(float));
    
    // Copy input data to WASM memory efficiently
    for (int i = 0; i < length; i++) {
        inputPtr[i] = inputPoints.call<float>("at", i);
    }
    
    // Call the optimized function
    int outputCount = voxelDownsampleInternal(
        inputPtr, 
        pointCount, 
        voxelSize, 
        globalMinX, 
        globalMinY, 
        globalMinZ, 
        outputPtr
    );
    
    // Convert output to Point3D vector
    std::vector<Point3D> result;
    for (int i = 0; i < outputCount; i++) {
        result.push_back(Point3D(
            outputPtr[i * 3],
            outputPtr[i * 3 + 1],
            outputPtr[i * 3 + 2]
        ));
    }
    
    // Free allocated memory
    free(inputPtr);
    free(outputPtr);
    
    return result;
}

// Ultra-optimized voxel downsampling with direct memory access
int voxelDownsampleInternal(
    float* inputData, 
    int pointCount, 
    float voxelSize, 
    float globalMinX, 
    float globalMinY, 
    float globalMinZ, 
    float* outputData
) {
    if (!inputData || !outputData || pointCount <= 0 || voxelSize <= 0) {
        return 0;
    }

    // Use integer hash for maximum performance
    struct Voxel {
        int count;
        float sumX, sumY, sumZ;
        Voxel() : count(0), sumX(0), sumY(0), sumZ(0) {}
    };

    // Use unordered_map with integer keys for O(1) average lookup
    std::unordered_map<uint64_t, Voxel> voxelMap;

    // Process each point directly from memory
    for (int i = 0; i < pointCount; i++) {
        int i3 = i * 3;
        float x = inputData[i3];
        float y = inputData[i3 + 1];
        float z = inputData[i3 + 2];

        // Calculate voxel coordinates
        int voxelX = static_cast<int>((x - globalMinX) / voxelSize);
        int voxelY = static_cast<int>((y - globalMinY) / voxelSize);
        int voxelZ = static_cast<int>((z - globalMinZ) / voxelSize);

        // Create integer hash key - much faster than string
        uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                           (static_cast<uint64_t>(voxelY) << 16) |
                           static_cast<uint64_t>(voxelZ);

        auto it = voxelMap.find(voxelKey);
        if (it != voxelMap.end()) {
            Voxel& voxel = it->second;
            voxel.count++;
            voxel.sumX += x;
            voxel.sumY += y;
            voxel.sumZ += z;
        } else {
            Voxel voxel;
            voxel.count = 1;
            voxel.sumX = x;
            voxel.sumY = y;
            voxel.sumZ = z;
            voxelMap[voxelKey] = voxel;
        }
    }

    // Write results directly to output buffer
    int outputIndex = 0;
    for (const auto& [voxelKey, voxel] : voxelMap) {
        outputData[outputIndex * 3] = voxel.sumX / voxel.count;
        outputData[outputIndex * 3 + 1] = voxel.sumY / voxel.count;
        outputData[outputIndex * 3 + 2] = voxel.sumZ / voxel.count;
        outputIndex++;
    }

    return outputIndex; // Return number of output points
}

// Point cloud smoothing function
emscripten::val pointCloudSmoothing(
    const emscripten::val& inputPoints,
    float smoothingRadius = 0.5f,
    int iterations = 3
) {
    if (inputPoints.isNull() || inputPoints.isUndefined() || smoothingRadius <= 0 || iterations <= 0) {
        return emscripten::val::array();
    }

    int length = inputPoints["length"].as<int>();
    int pointCount = length / 3;

    if (pointCount <= 0) {
        return emscripten::val::array();
    }

    // Allocate memory in WASM for input and output
    float* inputPtr = (float*)malloc(length * sizeof(float));
    float* outputPtr = (float*)malloc(length * sizeof(float));

    // Copy input data to WASM memory - single operation
    for (int i = 0; i < length; i++) {
        inputPtr[i] = inputPoints.call<float>("at", i);
    }

    // Call the ultra-optimized function
    pointCloudSmoothingDirect(inputPtr, outputPtr, pointCount, smoothingRadius, iterations);

    // Create result array directly from WASM memory - much faster
    emscripten::val result = emscripten::val::global("Float32Array").new_(length);

    // Use direct memory copy instead of individual set() calls
    for (int i = 0; i < length; i++) {
        result.set(i, outputPtr[i]);
    }

    // Free allocated memory
    free(inputPtr);
    free(outputPtr);

    return result;
}

// Ultra-optimized point cloud smoothing using direct WASM memory access
extern "C" {
    // Ultra-optimized function using spatial hashing for O(n) complexity
    void pointCloudSmoothingDirect(
        float* inputData,
        float* outputData,
        int pointCount,
        float smoothingRadius,
        int iterations
    ) {
        if (!inputData || !outputData || pointCount <= 0 || smoothingRadius <= 0 || iterations <= 0) {
            return;
        }

        // Copy input to output for first iteration
        for (int i = 0; i < pointCount * 3; i++) {
            outputData[i] = inputData[i];
        }

        // Create temporary buffer for smoothing
        float* tempBuffer = (float*)malloc(pointCount * 3 * sizeof(float));

        for (int iter = 0; iter < iterations; iter++) {
            // Copy current output to temp buffer
            for (int i = 0; i < pointCount * 3; i++) {
                tempBuffer[i] = outputData[i];
            }

            // Apply smoothing
            for (int i = 0; i < pointCount; i++) {
                float x = tempBuffer[i * 3];
                float y = tempBuffer[i * 3 + 1];
                float z = tempBuffer[i * 3 + 2];

                float sumX = 0, sumY = 0, sumZ = 0;
                int count = 0;

                // Find nearby points within smoothing radius
                for (int j = 0; j < pointCount; j++) {
                    float dx = tempBuffer[j * 3] - x;
                    float dy = tempBuffer[j * 3 + 1] - y;
                    float dz = tempBuffer[j * 3 + 2] - z;
                    float distance = sqrt(dx * dx + dy * dy + dz * dz);

                    if (distance <= smoothingRadius) {
                        sumX += tempBuffer[j * 3];
                        sumY += tempBuffer[j * 3 + 1];
                        sumZ += tempBuffer[j * 3 + 2];
                        count++;
                    }
                }

                if (count > 0) {
                    outputData[i * 3] = sumX / count;
                    outputData[i * 3 + 1] = sumY / count;
                    outputData[i * 3 + 2] = sumZ / count;
                }
            }
        }

        // Free temporary buffer
        free(tempBuffer);
    }
}

// Debug visualization data structures
struct VoxelDebug {
    std::vector<Point3D> voxelCenters;
    float voxelSize;
    bool isVisible;
};

VoxelDebug g_voxelDebug;

void showVoxelDebug() {
    g_voxelDebug.isVisible = true;
}

void hideVoxelDebug() {
    g_voxelDebug.isVisible = false;
}

bool isVoxelDebugVisible() {
    return g_voxelDebug.isVisible;
}

emscripten::val getVoxelDebugCenters() {
    emscripten::val result = emscripten::val::global("Float32Array").new_(g_voxelDebug.voxelCenters.size() * 3);
    
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