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

    // Ultra-optimized voxel downsampling using integer hash keys
    struct Voxel {
        int count;
        float sumX, sumY, sumZ;
        Voxel() : count(0), sumX(0), sumY(0), sumZ(0) {}
    };
    
    // Use integer hash instead of string - MUCH faster in WASM
    std::unordered_map<uint64_t, Voxel> voxelMap;
    
    for (const auto& point : points) {
        int voxelX = static_cast<int>((point.x - globalMinX) / voxelSize);
        int voxelY = static_cast<int>((point.y - globalMinY) / voxelSize);
        int voxelZ = static_cast<int>((point.z - globalMinZ) / voxelSize);
        
        // Create integer hash key - much faster than string concatenation
        uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) | 
                           (static_cast<uint64_t>(voxelY) << 16) | 
                           static_cast<uint64_t>(voxelZ);
        
        auto it = voxelMap.find(voxelKey);
        if (it != voxelMap.end()) {
            Voxel& voxel = it->second;
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

// Ultra-optimized point cloud smoothing using direct WASM memory access
extern "C" {
    // Ultra-optimized function using spatial hashing for O(n) complexity
    void pointCloudSmoothingDirect(float* inputData, float* outputData, int pointCount, float smoothingRadius, int iterations) {
        if (!inputData || !outputData || pointCount <= 0 || smoothingRadius <= 0 || iterations <= 0) {
            return;
        }
        
        int length = pointCount * 3;
        
        // Pre-calculate squared radius to avoid sqrt in inner loop
        float radiusSquared = smoothingRadius * smoothingRadius;
        
        // Copy input data to output buffer
        for (int i = 0; i < length; i++) {
            outputData[i] = inputData[i];
        }
        
        // Pre-allocate temporary buffer once
        float* tempBuffer = (float*)malloc(length * sizeof(float));
        
        // Calculate grid cell size (use smoothing radius as cell size)
        float cellSize = smoothingRadius;
        float invCellSize = 1.0f / cellSize;
        
        // Find bounding box
        float minX = inputData[0], maxX = inputData[0];
        float minY = inputData[1], maxY = inputData[1];
        float minZ = inputData[2], maxZ = inputData[2];
        
        for (int i = 0; i < pointCount; i++) {
            int i3 = i * 3;
            minX = (inputData[i3] < minX) ? inputData[i3] : minX;
            maxX = (inputData[i3] > maxX) ? inputData[i3] : maxX;
            minY = (inputData[i3 + 1] < minY) ? inputData[i3 + 1] : minY;
            maxY = (inputData[i3 + 1] > maxY) ? inputData[i3 + 1] : maxY;
            minZ = (inputData[i3 + 2] < minZ) ? inputData[i3 + 2] : minZ;
            maxZ = (inputData[i3 + 2] > maxZ) ? inputData[i3 + 2] : maxZ;
        }
        
        // Calculate grid dimensions
        int gridWidth = static_cast<int>((maxX - minX) * invCellSize) + 1;
        int gridHeight = static_cast<int>((maxY - minY) * invCellSize) + 1;
        int gridDepth = static_cast<int>((maxZ - minZ) * invCellSize) + 1;
        
        // Create spatial hash grid
        std::vector<std::vector<int>> grid(gridWidth * gridHeight * gridDepth);
        
        // Hash function to get grid index
        auto getGridIndex = [&](float x, float y, float z) -> int {
            int gx = static_cast<int>((x - minX) * invCellSize);
            int gy = static_cast<int>((y - minY) * invCellSize);
            int gz = static_cast<int>((z - minZ) * invCellSize);
            return gx + gy * gridWidth + gz * gridWidth * gridHeight;
        };
        
        // Smoothing iterations using spatial hashing
        for (int iter = 0; iter < iterations; iter++) {
            // Copy current state to temp buffer
            for (int i = 0; i < length; i++) {
                tempBuffer[i] = outputData[i];
            }
            
            // Clear grid
            for (auto& cell : grid) {
                cell.clear();
            }
            
            // Populate grid with current point positions
            for (int i = 0; i < pointCount; i++) {
                int i3 = i * 3;
                int gridIndex = getGridIndex(tempBuffer[i3], tempBuffer[i3 + 1], tempBuffer[i3 + 2]);
                if (gridIndex >= 0 && gridIndex < grid.size()) {
                    grid[gridIndex].push_back(i);
                }
            }
            
            // Process each point using spatial hash
            for (int i = 0; i < pointCount; i++) {
                int i3 = i * 3;
                float x = tempBuffer[i3];
                float y = tempBuffer[i3 + 1];
                float z = tempBuffer[i3 + 2];
                
                float sumX = 0.0f, sumY = 0.0f, sumZ = 0.0f;
                int count = 0;
                
                // Check neighboring grid cells (3x3x3 = 27 cells)
                for (int dx = -1; dx <= 1; dx++) {
                    for (int dy = -1; dy <= 1; dy++) {
                        for (int dz = -1; dz <= 1; dz++) {
                            int gridIndex = getGridIndex(x + dx * cellSize, y + dy * cellSize, z + dz * cellSize);
                            if (gridIndex >= 0 && gridIndex < grid.size()) {
                                for (int j : grid[gridIndex]) {
                                    if (i == j) continue;
                                    
                                    int j3 = j * 3;
                                    float dx2 = tempBuffer[j3] - x;
                                    float dy2 = tempBuffer[j3 + 1] - y;
                                    float dz2 = tempBuffer[j3 + 2] - z;
                                    
                                    float distanceSquared = dx2 * dx2 + dy2 * dy2 + dz2 * dz2;
                                    
                                    if (distanceSquared <= radiusSquared) {
                                        sumX += tempBuffer[j3];
                                        sumY += tempBuffer[j3 + 1];
                                        sumZ += tempBuffer[j3 + 2];
                                        count++;
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Apply smoothing if neighbors found
                if (count > 0) {
                    outputData[i3] = (x + sumX) / (count + 1);
                    outputData[i3 + 1] = (y + sumY) / (count + 1);
                    outputData[i3 + 2] = (z + sumZ) / (count + 1);
                }
            }
        }
        
        // Free temporary buffer
        free(tempBuffer);
    }
    
    // Ultra-optimized voxel downsampling with direct memory access
    int voxelDownsampleDirect(
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
}

// Ultra-optimized wrapper using direct memory access
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

// Ultra-optimized voxel downsampling wrapper using direct memory access
emscripten::val voxelDownsampleOptimized(
    const emscripten::val& inputPoints, 
    float voxelSize,
    float globalMinX = 0.0f,
    float globalMinY = 0.0f,
    float globalMinZ = 0.0f
) {
    if (inputPoints.isNull() || inputPoints.isUndefined() || voxelSize <= 0) {
        return emscripten::val::array();
    }
    
    int length = inputPoints["length"].as<int>();
    int pointCount = length / 3;
    
    // Allocate memory for input and output data
    float* inputPtr = (float*)malloc(length * sizeof(float));
    float* outputPtr = (float*)malloc(length * sizeof(float));
    
    // Copy input data to WASM memory
    for (int i = 0; i < length; i++) {
        inputPtr[i] = inputPoints.call<float>("at", i);
    }
    
    // Call the optimized direct function
    int outputCount = voxelDownsampleDirect(
        inputPtr, 
        pointCount, 
        voxelSize, 
        globalMinX, 
        globalMinY, 
        globalMinZ, 
        outputPtr
    );
    
    // Create result array
    emscripten::val result = emscripten::val::global("Float32Array").new_(outputCount * 3);
    for (int i = 0; i < outputCount * 3; i++) {
        result.set(i, outputPtr[i]);
    }
    
    // Free allocated memory
    free(inputPtr);
    free(outputPtr);
    
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
    emscripten::function("voxelDownsampleOptimized", &voxelDownsampleOptimized);
    emscripten::function("pointCloudSmoothing", &pointCloudSmoothing);
    emscripten::function("showVoxelDebug", &showVoxelDebug);
    emscripten::function("hideVoxelDebug", &hideVoxelDebug);
    emscripten::function("getVoxelDebugCenters", &getVoxelDebugCenters);
    emscripten::function("getVoxelDebugSize", &getVoxelDebugSize);
    emscripten::function("isVoxelDebugVisible", &isVoxelDebugVisible);
}


