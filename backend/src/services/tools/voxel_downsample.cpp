#include <iostream>
#include <vector>
#include <unordered_map>
#include <cmath>
#include <sstream>
#include <cstdint>

struct Point3D {
    float x, y, z;
    Point3D(float x = 0, float y = 0, float z = 0) : x(x), y(y), z(z) {}
};

struct Voxel {
    int count;
    float sumX, sumY, sumZ;
    Voxel() : count(0), sumX(0), sumY(0), sumZ(0) {}
};

int main() {
    std::string line;
    std::getline(std::cin, line);
    
    // Parse input: pointCount voxelSize minX minY minZ maxX maxY maxZ
    std::istringstream iss(line);
    int pointCount;
    float voxelSize, minX, minY, minZ, maxX, maxY, maxZ;
    iss >> pointCount >> voxelSize >> minX >> minY >> minZ >> maxX >> maxY >> maxZ;
    
    // Read point cloud data directly into memory - much faster than vector
    float* inputData = (float*)malloc(pointCount * 3 * sizeof(float));
    for (int i = 0; i < pointCount; i++) {
        std::cin >> inputData[i * 3] >> inputData[i * 3 + 1] >> inputData[i * 3 + 2];
    }
    
    // ULTRA OPTIMIZED C++ voxel downsampling - matches WASM version exactly
    // OPTIMIZATION 1: Pre-calculate inverse voxel size to avoid division
    float invVoxelSize = 1.0f / voxelSize;
    
    // OPTIMIZATION 2: Use HashMap with integer keys and direct coordinate storage (same as WASM)
    std::unordered_map<uint64_t, std::tuple<float, float, float, int>> voxelMap;
    voxelMap.reserve(pointCount / 4); // Reserve space to avoid rehashing
    
    // OPTIMIZATION 3: Process points in chunks for better cache locality (same as WASM)
    const int CHUNK_SIZE = 1024;
    for (int chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        int chunkEnd = std::min(chunkStart + CHUNK_SIZE, pointCount);
        
        for (int i = chunkStart; i < chunkEnd; i++) {
            int i3 = i * 3;
            float x = inputData[i3];
            float y = inputData[i3 + 1];
            float z = inputData[i3 + 2];
            
            // OPTIMIZATION 4: Use multiplication instead of division (same as WASM)
            int voxelX = static_cast<int>((x - minX) * invVoxelSize);
            int voxelY = static_cast<int>((y - minY) * invVoxelSize);
            int voxelZ = static_cast<int>((z - minZ) * invVoxelSize);
            
            // OPTIMIZATION 5: Use integer hash key (same as WASM)
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                               (static_cast<uint64_t>(voxelY) << 16) |
                               static_cast<uint64_t>(voxelZ);
            
            // OPTIMIZATION 6: Store sums directly (no coordinate storage needed for downsampling)
            auto it = voxelMap.find(voxelKey);
            if (it != voxelMap.end()) {
                auto& [sumX, sumY, sumZ, count] = it->second;
                sumX += x;
                sumY += y;
                sumZ += z;
                count++;
            } else {
                voxelMap.emplace(voxelKey, std::make_tuple(x, y, z, 1));
            }
        }
    }
    
    // OPTIMIZATION 7: Pre-allocate result vector (same as WASM)
    int outputCount = voxelMap.size();
    float* outputData = (float*)malloc(outputCount * 3 * sizeof(float));
    
    // OPTIMIZATION 8: Single pass conversion with direct average calculation (same as WASM)
    int outputIndex = 0;
    for (const auto& [voxelKey, voxelData] : voxelMap) {
        const auto& [sumX, sumY, sumZ, count] = voxelData;
        
        // Calculate average position (voxel center) - direct memory write
        outputData[outputIndex * 3] = sumX / count;
        outputData[outputIndex * 3 + 1] = sumY / count;
        outputData[outputIndex * 3 + 2] = sumZ / count;
        outputIndex++;
    }
    
    // Output results
    std::cout << voxelMap.size() << std::endl; // voxel count
    std::cout << pointCount << std::endl; // original count
    std::cout << outputCount << std::endl; // downsampled count
    
    // Output points directly from memory - much faster than vector iteration
    for (int i = 0; i < outputCount * 3; i++) {
        std::cout << outputData[i] << " ";
    }
    std::cout << std::endl;
    
    // Free allocated memory
    free(inputData);
    free(outputData);
    
    return 0;
}
