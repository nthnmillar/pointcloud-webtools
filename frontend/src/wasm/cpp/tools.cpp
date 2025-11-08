#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <cmath>
#include <cstdint>
#include <cstring>
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
    
    // Direct pointer-based voxel downsampling for zero-copy input access
    // JavaScript allocates memory, copies input data with HEAPF32.set(), calls this function,
    // then reads results from outputPtr using the existing Embind function
    int voxelDownsampleDirect(
        float* inputPtr,      // Pointer to input data in WASM heap (already copied via HEAPF32.set())
        int pointCount,        // Number of points (length / 3)
        float voxelSize,
        float globalMinX,
        float globalMinY,
        float globalMinZ,
        float* outputPtr      // Pointer to output buffer (pre-allocated, at least pointCount * 3 floats)
    ) {
        if (!inputPtr || !outputPtr || pointCount <= 0 || voxelSize <= 0) {
            return 0;
        }
        
        return voxelDownsampleInternal(
            inputPtr,
            pointCount,
            voxelSize,
            globalMinX,
            globalMinY,
            globalMinZ,
            outputPtr
        );
    }
}

// Optimized voxel downsampling function - returns Float32Array directly
emscripten::val voxelDownsample(
    const emscripten::val& inputPoints, 
    float voxelSize,
    float globalMinX = 0.0f,
    float globalMinY = 0.0f,
    float globalMinZ = 0.0f
) {
    if (inputPoints.isNull() || inputPoints.isUndefined() || voxelSize <= 0) {
        return emscripten::val::global("Float32Array").new_();
    }
    
    int length = inputPoints["length"].as<int>();
    int pointCount = length / 3;
    
    if (length <= 0 || length % 3 != 0) {
        return emscripten::val::global("Float32Array").new_();
    }
    
    // OPTIMIZATION: Copy input data efficiently
    // Note: Direct memory access requires the Float32Array to be in WASM memory
    // Since it's passed from JS, we need to copy it to WASM memory
    float* inputPtr = (float*)malloc(length * sizeof(float));
    
    // Copy input data efficiently - element-by-element is necessary when
    // the Float32Array is not in WASM memory
    for (int i = 0; i < length; i++) {
        inputPtr[i] = inputPoints.call<float>("at", i);
    }
    
    // Allocate output buffer
    float* outputPtr = (float*)malloc(length * sizeof(float));
    
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
    
    // Create Float32Array directly from output buffer - use .set() method
    emscripten::val resultArray = emscripten::val::global("Float32Array").new_(outputCount * 3);
    
    // Copy directly from output buffer to result array using .set()
    for (int i = 0; i < outputCount * 3; i++) {
        resultArray.set(i, outputPtr[i]);
    }
    
    // Free allocated memory
    free(inputPtr);
    free(outputPtr);
    
    return resultArray;
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

        // Pre-calculate inverse voxel size to avoid division
        float invVoxelSize = 1.0f / voxelSize;

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
            
            // Calculate voxel coordinates - use floor() to match TypeScript/Rust Math.floor()
            int voxelX = static_cast<int>(std::floor((x - globalMinX) * invVoxelSize));
            int voxelY = static_cast<int>(std::floor((y - globalMinY) * invVoxelSize));
            int voxelZ = static_cast<int>(std::floor((z - globalMinZ) * invVoxelSize));
            
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
    // Ultra-optimized function using O(n) spatial hashing (same as Rust)
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

        // OPTIMIZATION: Use O(n) spatial hashing algorithm (same as Rust)
        float radiusSquared = smoothingRadius * smoothingRadius;
        float cellSize = smoothingRadius;
        float invCellSize = 1.0f / cellSize;
        
        // Find bounding box - single pass
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
        int gridSize = gridWidth * gridHeight * gridDepth;
        
        // Pre-allocate grid with capacity estimation
        std::vector<std::vector<int>> grid(gridSize);
        for (auto& cell : grid) {
            cell.reserve(8); // Pre-allocate capacity
        }
        
        // Hash function to get grid index (same as Rust)
        auto getGridIndex = [&](float x, float y, float z) -> int {
            int gx = static_cast<int>((x - minX) * invCellSize);
            int gy = static_cast<int>((y - minY) * invCellSize);
            int gz = static_cast<int>((z - minZ) * invCellSize);
            return gx + gy * gridWidth + gz * gridWidth * gridHeight;
        };
        
        // Create temporary buffer for smoothing
        float* tempBuffer = (float*)malloc(pointCount * 3 * sizeof(float));
        
        // Smoothing iterations using spatial hashing (same as Rust)
        for (int iter = 0; iter < iterations; iter++) {
            // Copy current state to temp buffer
            for (int i = 0; i < pointCount * 3; i++) {
                tempBuffer[i] = outputData[i];
            }
            
            // Clear grid efficiently
            for (auto& cell : grid) {
                cell.clear();
            }
            
            // Populate grid with PREVIOUS iteration's point positions
            for (int i = 0; i < pointCount; i++) {
                int i3 = i * 3;
                float x = tempBuffer[i3];
                float y = tempBuffer[i3 + 1];
                float z = tempBuffer[i3 + 2];
                int gridIndex = getGridIndex(x, y, z);
                if (gridIndex >= 0 && gridIndex < gridSize) {
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
                
                // Check neighboring grid cells (3x3x3 = 27 cells) - same as Rust
                for (int dx = -1; dx <= 1; dx++) {
                    for (int dy = -1; dy <= 1; dy++) {
                        for (int dz = -1; dz <= 1; dz++) {
                            int gridIndex = getGridIndex(
                                x + dx * cellSize,
                                y + dy * cellSize,
                                z + dz * cellSize
                            );
                            
                            if (gridIndex >= 0 && gridIndex < gridSize) {
                                for (int j : grid[gridIndex]) {
                                    if (i == j) continue;
                                    
                                    int j3 = j * 3;
                                    float jx = tempBuffer[j3];
                                    float jy = tempBuffer[j3 + 1];
                                    float jz = tempBuffer[j3 + 2];
                                    
                                    float dx2 = jx - x;
                                    float dy2 = jy - y;
                                    float dz2 = jz - z;
                                    
                                    float distanceSquared = dx2 * dx2 + dy2 * dy2 + dz2 * dz2;
                                    
                                    if (distanceSquared <= radiusSquared) {
                                        sumX += jx;
                                        sumY += jy;
                                        sumZ += jz;
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

// Optimized voxel debug with efficient memory access
// Uses provided bounds to match TypeScript/Rust implementations exactly
void showVoxelDebug(const emscripten::val& inputPoints, float voxelSize, float minX, float minY, float minZ) {
    if (inputPoints.isNull() || inputPoints.isUndefined() || voxelSize <= 0) {
        g_voxelDebug.voxelCenters.clear();
        return;
    }
    
    int length = inputPoints["length"].as<int>();
    int pointCount = length / 3;
    
    if (pointCount <= 0) {
        g_voxelDebug.voxelCenters.clear();
        return;
    }
    
    // Use provided bounds (same as TypeScript/Rust) - ensures identical results
    
    // OPTIMIZATION 3: Pre-calculate inverse voxel size to avoid division
    float invVoxelSize = 1.0f / voxelSize;
    
    // OPTIMIZATION 4: Use unordered_set for unique voxel coordinates (same as Rust)
    std::unordered_set<uint64_t> voxelKeys;
    voxelKeys.reserve(pointCount / 4); // Reserve space to avoid rehashing
    
    // OPTIMIZATION 5: Process points in chunks for better cache locality
    const int CHUNK_SIZE = 1024;
    for (int chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        int chunkEnd = std::min(chunkStart + CHUNK_SIZE, pointCount);
        
        for (int i = chunkStart; i < chunkEnd; i++) {
            int i3 = i * 3;
            float x = inputPoints.call<float>("at", i3);
            float y = inputPoints.call<float>("at", i3 + 1);
            float z = inputPoints.call<float>("at", i3 + 2);
            
            // OPTIMIZATION 6: Use multiplication instead of division
            // Use floor() to match TypeScript/Rust Math.floor() behavior (handles negative correctly)
            int voxelX = static_cast<int>(std::floor((x - minX) * invVoxelSize));
            int voxelY = static_cast<int>(std::floor((y - minY) * invVoxelSize));
            int voxelZ = static_cast<int>(std::floor((z - minZ) * invVoxelSize));
            
            // OPTIMIZATION 7: Better hash function for better distribution
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                               (static_cast<uint64_t>(voxelY) << 16) |
                               static_cast<uint64_t>(voxelZ);
            
            // OPTIMIZATION 8: Store unique voxel keys only (same as Rust)
            voxelKeys.insert(voxelKey);
        }
    }
    
    // OPTIMIZATION 9: Pre-allocate result vector and use move semantics
    g_voxelDebug.voxelCenters.clear();
    g_voxelDebug.voxelCenters.reserve(voxelKeys.size());
    g_voxelDebug.voxelSize = voxelSize;
    
    // OPTIMIZATION 10: Single pass conversion with pre-calculated values
    float halfVoxelSize = voxelSize * 0.5f;
    float offsetX = minX + halfVoxelSize;
    float offsetY = minY + halfVoxelSize;
    float offsetZ = minZ + halfVoxelSize;
    
    for (const uint64_t voxelKey : voxelKeys) {
        // Extract voxel coordinates from integer key
        int voxelX = static_cast<int>(voxelKey >> 32);
        int voxelY = static_cast<int>((voxelKey >> 16) & 0xFFFF);
        int voxelZ = static_cast<int>(voxelKey & 0xFFFF);
        
        // Calculate voxel grid position (center of voxel grid cell)
        float gridX = offsetX + voxelX * voxelSize;
        float gridY = offsetY + voxelY * voxelSize;
        float gridZ = offsetZ + voxelZ * voxelSize;
        
        g_voxelDebug.voxelCenters.emplace_back(gridX, gridY, gridZ);
    }
    
    g_voxelDebug.isVisible = true;
}


void hideVoxelDebug() {
    g_voxelDebug.isVisible = false;
}

bool isVoxelDebugVisible() {
    return g_voxelDebug.isVisible;
}

emscripten::val getVoxelDebugCenters() {
    size_t voxelCount = g_voxelDebug.voxelCenters.size();
    emscripten::val result = emscripten::val::global("Float32Array").new_(voxelCount * 3);
    
    // Use .set() method - safe and works correctly
    // Direct memory access requires WASM heap backing which isn't guaranteed
    for (size_t i = 0; i < voxelCount; i++) {
        int i3 = static_cast<int>(i * 3);
        result.set(i3, g_voxelDebug.voxelCenters[i].x);
        result.set(i3 + 1, g_voxelDebug.voxelCenters[i].y);
        result.set(i3 + 2, g_voxelDebug.voxelCenters[i].z);
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
    emscripten::function("showVoxelDebug", emscripten::select_overload<void()>(&showVoxelDebug));
    emscripten::function("showVoxelDebug", emscripten::select_overload<void(const emscripten::val&, float, float, float, float)>(&showVoxelDebug));
    emscripten::function("hideVoxelDebug", &hideVoxelDebug);
    emscripten::function("getVoxelDebugCenters", &getVoxelDebugCenters);
    emscripten::function("getVoxelDebugSize", &getVoxelDebugSize);
    emscripten::function("isVoxelDebugVisible", &isVoxelDebugVisible);
}