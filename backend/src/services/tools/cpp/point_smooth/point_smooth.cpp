#include <iostream>
#include <vector>
#include <cmath>
#include <cstring>
#include <cstdint>
#include <algorithm>

// Binary protocol for fast I/O
// Input format: [uint32_t pointCount][float smoothingRadius][float iterations][float* pointData]
// Output format: [uint32_t pointCount][float* smoothedPoints]

// Optimized point cloud smoothing using direct memory management
void pointCloudSmoothingDirect(float* inputData, float* outputData, int pointCount, float smoothingRadius, int iterations) {
    if (!inputData || !outputData || pointCount <= 0 || smoothingRadius <= 0 || iterations <= 0) {
        return;
    }
    
    int length = pointCount * 3;
    
    // Pre-calculate squared radius to avoid sqrt in inner loop
    float radiusSquared = smoothingRadius * smoothingRadius;
    
    // Copy input data to output buffer (optimized with memcpy)
    std::memcpy(outputData, inputData, length * sizeof(float));
    
    // Pre-allocate temporary buffer once (same as C++ WASM)
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
    int gridSize = gridWidth * gridHeight * gridDepth; // Pre-compute for efficiency
    
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
    
    // Hash function to get grid index (truncate toward zero)
    auto getGridIndex = [&](float x, float y, float z) -> int {
        int gx = static_cast<int>((x - minX) * invCellSize);
        int gy = static_cast<int>((y - minY) * invCellSize);
        int gz = static_cast<int>((z - minZ) * invCellSize);
        return gx + gy * gridWidth + gz * gridWidth * gridHeight;
    };
    
    // Smoothing iterations using spatial hashing (same as C++ WASM)
    for (int iter = 0; iter < iterations; iter++) {
        // Copy current state to temp buffer (optimized with memcpy, same as Rust's clone)
        std::memcpy(tempBuffer, outputData, length * sizeof(float));
        
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
            
            // Check neighboring grid cells (3x3x3 = 27 cells) - same as C++ WASM
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
                                int neighborIndex = flatGrid[idx];
                                if (i == neighborIndex) continue; // Skip self (same as Rust)
                                
                                int n3 = neighborIndex * 3;
                                // Direct pointer access (faster)
                                float nx = tempPtr[n3];
                                float ny = tempPtr[n3 + 1];
                                float nz = tempPtr[n3 + 2];
                                
                                float dx2 = x - nx;
                                float dy2 = y - ny;
                                float dz2 = z - nz;
                                float distSquared = dx2 * dx2 + dy2 * dy2 + dz2 * dz2;
                                
                                if (distSquared <= radiusSquared) {
                                    sumX += nx;
                                    sumY += ny;
                                    sumZ += nz;
                                    count++;
                                }
                            }
                        }
                    }
                }
            }
            
            // Update point position (direct pointer write, pre-compute count + 1)
            if (count > 0) {
                // Pre-compute count + 1 to avoid repeated addition
                float countPlus1 = static_cast<float>(count + 1);
                outPtr[i3] = (x + sumX) / countPlus1;
                outPtr[i3 + 1] = (y + sumY) / countPlus1;
                outPtr[i3 + 2] = (z + sumZ) / countPlus1;
            }
        }
    }
    
    // Free allocated memory
    free(tempBuffer);
}

int main() {
    // OPTIMIZATION: Disable synchronization with stdio for faster I/O (critical for performance!)
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(nullptr);
    
    // Read binary input for fast I/O
    // Binary format: [uint32_t pointCount][float smoothingRadius][float iterations][float* pointData]
    
    // Read binary header in one read (12 bytes: 4 for uint32 + 4 for float + 4 for float)
    alignas(4) char header[12];
    if (!std::cin.read(header, 12) || std::cin.gcount() != 12) {
        return 1; // Failed to read header
    }
    
    // Extract values from header (little-endian, safe unaligned access)
    uint32_t pointCount;
    float smoothingRadius, iterations;
    std::memcpy(&pointCount, &header[0], sizeof(uint32_t));
    std::memcpy(&smoothingRadius, &header[4], sizeof(float));
    std::memcpy(&iterations, &header[8], sizeof(float));
    int iterationsInt = static_cast<int>(iterations);
    
    // Validate input
    if (pointCount == 0 || smoothingRadius <= 0 || iterationsInt <= 0) {
        // Write empty result (4 bytes: pointCount = 0)
        uint32_t outputCount = 0;
        std::cout.write(reinterpret_cast<const char*>(&outputCount), sizeof(uint32_t));
        std::cout.flush();
        return 0;
    }
    
    // Read point data directly into vector
    const size_t floatCount = pointCount * 3;
    std::vector<float> inputData(floatCount);
    
    if (!std::cin.read(reinterpret_cast<char*>(inputData.data()), floatCount * sizeof(float))) {
        return 1; // Failed to read point data
    }
    
    // Allocate output buffer
    std::vector<float> outputData(floatCount);
    
    // Call optimized smoothing function
    pointCloudSmoothingDirect(inputData.data(), outputData.data(), pointCount, smoothingRadius, iterationsInt);
    
    // Write binary output for fast I/O
    // Binary format: [uint32_t pointCount][float* smoothedPoints]
    
    // Write output count (4 bytes)
    std::cout.write(reinterpret_cast<const char*>(&pointCount), sizeof(uint32_t));
    
    // Write smoothed points directly (binary, no serialization overhead!)
    std::cout.write(reinterpret_cast<const char*>(outputData.data()), floatCount * sizeof(float));
    std::cout.flush();
    
    return 0;
}
