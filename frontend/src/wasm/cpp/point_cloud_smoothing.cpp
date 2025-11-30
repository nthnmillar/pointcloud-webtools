#include <vector>
#include <cmath>
#include <cstring>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "common.h"

// Forward declaration
extern "C" {
    void pointCloudSmoothingDirect(float* inputData, float* outputData, int pointCount, 
                                  float smoothingRadius, int iterations);
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

        // Copy input to output for first iteration (optimized with memcpy)
        std::memcpy(outputData, inputData, pointCount * 3 * sizeof(float));

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
        
        // OPTIMIZATION: Use flat array structure for better cache locality
        // Instead of vector<vector<int>> (separate allocations), use:
        // - flatGrid: single array storing all point indices
        // - gridOffsets: where each cell starts in flatGrid
        // - gridCounts: how many points in each cell
        // This provides much better cache locality!
        std::vector<int> flatGrid;
        flatGrid.reserve(pointCount * 2); // Reserve space (estimate: 2x point count for safety)
        std::vector<int> gridOffsets(gridSize + 1); // +1 for end marker
        std::vector<int> gridCounts(gridSize, 0);
        
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
            // Copy current state to temp buffer (optimized with memcpy)
            std::memcpy(tempBuffer, outputData, pointCount * 3 * sizeof(float));
            
            // Clear grid efficiently (reset counts, keep flatGrid allocated)
            std::fill(gridCounts.begin(), gridCounts.end(), 0);
            flatGrid.clear();
            
            // Two-pass approach for flat array: first count, then populate in order
            // Pass 1: Count points per cell
            float* tempPtr = tempBuffer;
            for (int i = 0; i < pointCount; i++) {
                int i3 = i * 3;
                float x = tempPtr[i3];
                float y = tempPtr[i3 + 1];
                float z = tempPtr[i3 + 2];
                int gridIndex = getGridIndex(x, y, z);
                if (gridIndex >= 0 && gridIndex < gridSize) {
                    gridCounts[gridIndex]++;
                }
            }
            
            // Build offsets array (cumulative sum)
            int offset = 0;
            for (int i = 0; i < gridSize; i++) {
                gridOffsets[i] = offset;
                offset += gridCounts[i];
            }
            gridOffsets[gridSize] = offset; // End marker
            
            // Reset counts for second pass
            std::fill(gridCounts.begin(), gridCounts.end(), 0);
            flatGrid.resize(offset); // Pre-allocate exact size
            
            // Pass 2: Populate flatGrid in order (maintains cell grouping for cache locality)
            for (int i = 0; i < pointCount; i++) {
                int i3 = i * 3;
                float x = tempPtr[i3];
                float y = tempPtr[i3 + 1];
                float z = tempPtr[i3 + 2];
                int gridIndex = getGridIndex(x, y, z);
                if (gridIndex >= 0 && gridIndex < gridSize) {
                    int pos = gridOffsets[gridIndex] + gridCounts[gridIndex];
                    flatGrid[pos] = i;
                    gridCounts[gridIndex]++;
                }
            }
            
            // Process each point using spatial hash (optimized with direct pointer access)
            float* outPtr = outputData;
            for (int i = 0; i < pointCount; i++) {
                int i3 = i * 3;
                // Direct pointer access (faster than array indexing)
                float x = tempPtr[i3];
                float y = tempPtr[i3 + 1];
                float z = tempPtr[i3 + 2];
                
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
                                // OPTIMIZATION: Use flat array with direct pointer access (much better cache locality!)
                                int cellStart = gridOffsets[gridIndex];
                                int cellEnd = gridOffsets[gridIndex + 1];
                                // Direct iteration over flat array (contiguous memory = better cache performance)
                                for (int idx = cellStart; idx < cellEnd; idx++) {
                                    int j = flatGrid[idx];
                                    if (i == j) continue; // Skip self (same as Rust)
                                    
                                    int j3 = j * 3;
                                    // Direct pointer access (faster)
                                    float jx = tempPtr[j3];
                                    float jy = tempPtr[j3 + 1];
                                    float jz = tempPtr[j3 + 2];
                                    
                                    // Optimized distance calculation (avoid intermediate variables)
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
                
                // Apply smoothing if neighbors found (direct pointer write)
                if (count > 0) {
                    // Pre-compute count + 1 to avoid repeated addition
                    float countPlus1 = static_cast<float>(count + 1);
                    outPtr[i3] = (x + sumX) / countPlus1;
                    outPtr[i3 + 1] = (y + sumY) / countPlus1;
                    outPtr[i3 + 2] = (z + sumZ) / countPlus1;
                }
            }
        }

        // Free temporary buffer
        free(tempBuffer);
    }
}

// Emscripten bindings for point cloud smoothing
EMSCRIPTEN_BINDINGS(point_cloud_smoothing_module) {
    emscripten::function("pointCloudSmoothing", &pointCloudSmoothing);
}

