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
    
    // Create spatial hash grid with pre-allocated capacity
    std::vector<std::vector<int>> grid(gridWidth * gridHeight * gridDepth);
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
        // Copy current state to temp buffer (same as C++ WASM)
        for (int i = 0; i < length; i++) {
            tempBuffer[i] = outputData[i];
        }
        
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
            if (gridIndex >= 0 && gridIndex < static_cast<int>(grid.size())) {
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
                        
                        if (gridIndex >= 0 && gridIndex < static_cast<int>(grid.size())) {
                            for (int neighborIndex : grid[gridIndex]) {
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
                outputData[i3] = sumX / count;
                outputData[i3 + 1] = sumY / count;
                outputData[i3 + 2] = sumZ / count;
            }
        }
    }
    
    // Free allocated memory
    free(tempBuffer);
}

int main() {
    std::string jsonInput;
    std::getline(std::cin, jsonInput);
    
    // Simple JSON parsing - find the values we need
    size_t pointsStart = jsonInput.find("\"point_cloud_data\":[");
    size_t radiusStart = jsonInput.find("\"smoothing_radius\":");
    size_t iterationsStart = jsonInput.find("\"iterations\":");
    
    if (pointsStart == std::string::npos || radiusStart == std::string::npos || iterationsStart == std::string::npos) {
        std::cout << "{\"error\":\"Invalid JSON format\"}" << std::endl;
        return 1;
    }
    
    // Parse smoothing radius
    size_t radiusValueStart = jsonInput.find(":", radiusStart) + 1;
    size_t radiusValueEnd = jsonInput.find(",", radiusValueStart);
    if (radiusValueEnd == std::string::npos) radiusValueEnd = jsonInput.find("}", radiusValueStart);
    float smoothingRadius = std::stof(jsonInput.substr(radiusValueStart, radiusValueEnd - radiusValueStart));
    
    // Parse iterations
    size_t iterationsValueStart = jsonInput.find(":", iterationsStart) + 1;
    size_t iterationsValueEnd = jsonInput.find(",", iterationsValueStart);
    if (iterationsValueEnd == std::string::npos) iterationsValueEnd = jsonInput.find("}", iterationsValueStart);
    int iterations = std::stoi(jsonInput.substr(iterationsValueStart, iterationsValueEnd - iterationsValueStart));
    
    // Count points in the array
    size_t arrayStart = jsonInput.find("[", pointsStart) + 1;
    size_t arrayEnd = jsonInput.find("]", arrayStart);
    std::string arrayContent = jsonInput.substr(arrayStart, arrayEnd - arrayStart);
    
    // Count commas to determine point count
    int pointCount = 0;
    size_t pos = 0;
    while ((pos = arrayContent.find(",", pos)) != std::string::npos) {
        pointCount++;
        pos++;
    }
    pointCount = (pointCount + 1) / 3; // Convert to point count
    
    // Allocate memory for input and output data
    int length = pointCount * 3;
    float* inputData = (float*)malloc(length * sizeof(float));
    float* outputData = (float*)malloc(length * sizeof(float));
    
    // Parse point data
    std::istringstream iss(arrayContent);
    for (int i = 0; i < length; i++) {
        iss >> inputData[i];
        if (iss.peek() == ',') iss.ignore();
    }
    
    // Call ultra-optimized smoothing function
    pointCloudSmoothingDirect(inputData, outputData, pointCount, smoothingRadius, iterations);
    
    // Output JSON results
    std::cout << "{\"smoothed_points\":[";
    for (int i = 0; i < length; i++) {
        if (i > 0) std::cout << ",";
        std::cout << outputData[i];
    }
    std::cout << "],\"original_count\":" << pointCount << ",\"smoothed_count\":" << pointCount << ",\"processing_time\":0}" << std::endl;
    
    // Free allocated memory
    free(inputData);
    free(outputData);
    
    return 0;
}