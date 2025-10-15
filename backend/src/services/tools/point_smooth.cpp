#include <iostream>
#include <vector>
#include <cmath>
#include <sstream>
#include <cstdlib>

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
    
    // Free allocated memory
    free(tempBuffer);
}

int main() {
    std::string line;
    std::getline(std::cin, line);
    
    // Parse input: pointCount smoothingRadius iterations
    std::istringstream iss(line);
    int pointCount;
    float smoothingRadius;
    int iterations;
    iss >> pointCount >> smoothingRadius >> iterations;
    
    // Allocate memory for input and output data (same as C++ WASM)
    int length = pointCount * 3;
    float* inputData = (float*)malloc(length * sizeof(float));
    float* outputData = (float*)malloc(length * sizeof(float));
    
    // Read point cloud data directly into input buffer
    for (int i = 0; i < pointCount; i++) {
        int i3 = i * 3;
        std::cin >> inputData[i3] >> inputData[i3 + 1] >> inputData[i3 + 2];
    }
    
    // Call ultra-optimized smoothing function (same as C++ WASM)
    pointCloudSmoothingDirect(inputData, outputData, pointCount, smoothingRadius, iterations);
    
    // Output results
    std::cout << pointCount << std::endl; // point count
    for (int i = 0; i < length; i++) {
        std::cout << outputData[i] << " ";
    }
    std::cout << std::endl;
    
    // Free allocated memory
    free(inputData);
    free(outputData);
    
    return 0;
}
