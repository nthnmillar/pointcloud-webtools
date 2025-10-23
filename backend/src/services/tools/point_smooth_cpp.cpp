#include <iostream>
#include <vector>
#include <cmath>
#include <sstream>
#include <cstdlib>
#include <string>
#include <chrono>

// Ultra-optimized point cloud smoothing using O(n) spatial hashing (same as Rust)
void pointCloudSmoothingDirect(float* inputData, float* outputData, int pointCount, float smoothingRadius, int iterations) {
    if (!inputData || !outputData || pointCount <= 0 || smoothingRadius <= 0 || iterations <= 0) {
        return;
    }
    
    int length = pointCount * 3;
    
    // OPTIMIZATION: Use O(n) spatial hashing algorithm (same as Rust)
    float radiusSquared = smoothingRadius * smoothingRadius;
    float cellSize = smoothingRadius;
    float invCellSize = 1.0f / cellSize;
    
    // Copy input data to output buffer
    for (int i = 0; i < length; i++) {
        outputData[i] = inputData[i];
    }
    
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
    
    // Pre-allocate temporary buffer once
    float* tempBuffer = (float*)malloc(length * sizeof(float));
    
    // Smoothing iterations using spatial hashing (same as Rust)
    for (int iter = 0; iter < iterations; iter++) {
        // Copy current state to temp buffer
        for (int i = 0; i < length; i++) {
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

int main() {
    std::string line;
    std::getline(std::cin, line);
    
    // Parse JSON input: {"point_cloud_data": [...], "smoothing_radius": 0.5, "iterations": 3}
    // Simple JSON parsing for our specific format
    size_t dataStart = line.find("\"point_cloud_data\":[") + 19;
    size_t dataEnd = line.find("],\"smoothing_radius\"");
    
    size_t radiusStart = line.find("\"smoothing_radius\":") + 19;
    size_t radiusEnd = line.find(",\"iterations\"");
    
    size_t iterStart = line.find("\"iterations\":") + 13;
    size_t iterEnd = line.find("}");
    
    // Extract values
    std::string dataStr = line.substr(dataStart, dataEnd - dataStart);
    std::string radiusStr = line.substr(radiusStart, radiusEnd - radiusStart);
    std::string iterStr = line.substr(iterStart, iterEnd - iterStart);
    
    float smoothingRadius = std::stof(radiusStr);
    int iterations = std::stoi(iterStr);
    
    // Parse point cloud data
    std::vector<float> pointData;
    std::istringstream iss(dataStr);
    std::string token;
    while (std::getline(iss, token, ',')) {
        pointData.push_back(std::stof(token));
    }
    
    int pointCount = pointData.size() / 3;
    
    // Allocate memory for input and output data
    int length = pointCount * 3;
    float* inputData = (float*)malloc(length * sizeof(float));
    float* outputData = (float*)malloc(length * sizeof(float));
    
    // Copy input data
    for (int i = 0; i < length; i++) {
        inputData[i] = pointData[i];
    }
    
    // Start timing
    auto start_time = std::chrono::high_resolution_clock::now();
    
    // Call ultra-optimized smoothing function
    pointCloudSmoothingDirect(inputData, outputData, pointCount, smoothingRadius, iterations);
    
    // End timing
    auto end_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time);
    double processing_time = duration.count() / 1000.0; // Convert to milliseconds
    
    // Output JSON result (same format as Rust BE)
    std::cout << "{";
    std::cout << "\"smoothed_points\":[";
    for (int i = 0; i < length; i++) {
        if (i > 0) std::cout << ",";
        std::cout << outputData[i];
    }
    std::cout << "],";
    std::cout << "\"original_count\":" << pointCount << ",";
    std::cout << "\"smoothed_count\":" << pointCount << ",";
    std::cout << "\"processing_time\":" << processing_time;
    std::cout << "}" << std::endl;
    
    // Free memory
    free(inputData);
    free(outputData);
    
    return 0;
}


