#include <iostream>
#include <vector>
#include <cmath>
#include <cstring>
#include <cstdint>

// Binary protocol for fast I/O (replaces JSON)
// Input format: [uint32_t pointCount][float smoothingRadius][float iterations][float* pointData]
// Output format: [uint32_t pointCount][float* smoothedPoints]

// Ultra-optimized point cloud smoothing using direct memory management (same as C++ WASM)
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
    int gridSize = gridWidth * gridHeight * gridDepth; // Pre-compute (same as Rust)
    
    // Create spatial hash grid with pre-allocated capacity
    std::vector<std::vector<int>> grid(gridSize);
    for (auto& cell : grid) {
        cell.reserve(8); // Pre-allocate capacity for better performance
    }
    
    // Hash function to get grid index (same as C++ WASM - truncate toward zero)
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
        
        // Clear grid efficiently
        for (auto& cell : grid) {
            cell.clear();
        }
        
        // Populate grid with PREVIOUS iteration's point positions (same as C++ WASM)
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
        
        // Process each point using spatial hash (same as C++ WASM)
        for (int i = 0; i < pointCount; i++) {
            int i3 = i * 3;
            float x = tempBuffer[i3];
            float y = tempBuffer[i3 + 1];
            float z = tempBuffer[i3 + 2];
            
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
                            // Store reference to avoid repeated indexing (optimization)
                            const std::vector<int>& cell = grid[gridIndex];
                            for (int neighborIndex : cell) {
                                if (i == neighborIndex) continue; // Skip self (same as Rust)
                                
                                int n3 = neighborIndex * 3;
                                float nx = tempBuffer[n3];
                                float ny = tempBuffer[n3 + 1];
                                float nz = tempBuffer[n3 + 2];
                                
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
            
            // Update point position (same as C++ WASM)
            if (count > 0) {
                outputData[i3] = (x + sumX) / (count + 1);
                outputData[i3 + 1] = (y + sumY) / (count + 1);
                outputData[i3 + 2] = (z + sumZ) / (count + 1);
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
    
    // OPTIMIZATION: Read binary input instead of JSON (much faster!)
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
    
    // Call ultra-optimized smoothing function
    pointCloudSmoothingDirect(inputData.data(), outputData.data(), pointCount, smoothingRadius, iterationsInt);
    
    // OPTIMIZATION: Write binary output instead of JSON (much faster!)
    // Binary format: [uint32_t pointCount][float* smoothedPoints]
    
    // Write output count (4 bytes)
    std::cout.write(reinterpret_cast<const char*>(&pointCount), sizeof(uint32_t));
    
    // Write smoothed points directly (binary, no serialization overhead!)
    std::cout.write(reinterpret_cast<const char*>(outputData.data()), floatCount * sizeof(float));
    std::cout.flush();
    
    return 0;
}
