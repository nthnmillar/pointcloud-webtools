#include <iostream>
#include <vector>
#include <unordered_map>
#include <cmath>
#include <sstream>
#include <cstdint>
#include <chrono>
#include <algorithm>
#include <iomanip>
#include <cctype>
#include <cstring>

// Binary protocol for fast I/O (replaces JSON)
// Input format: [uint32_t pointCount][float voxelSize][float minX][float minY][float minZ][float maxX][float maxY][float maxZ][float* pointData]
// Output format: [uint32_t outputCount][float* downsampledPoints]

// OPTIMIZATION: Use struct instead of tuple for better cache locality (matches WASM implementation)
struct Voxel {
    int count;
    float sumX, sumY, sumZ;
    Voxel() : count(0), sumX(0), sumY(0), sumZ(0) {}
    // Constructor for efficient initialization
    Voxel(int c, float x, float y, float z) : count(c), sumX(x), sumY(y), sumZ(z) {}
};

int main() {
    // OPTIMIZATION: Read binary input instead of JSON (much faster!)
    // Binary format: [uint32_t pointCount][float voxelSize][float minX][float minY][float minZ][float maxX][float maxY][float maxZ][float* pointData]
    
    // Read binary header (32 bytes: 4 for uint32 + 7*4 for floats)
    uint32_t pointCount;
    float voxelSize, minX, minY, minZ, maxX, maxY, maxZ;
    
    if (!std::cin.read(reinterpret_cast<char*>(&pointCount), sizeof(uint32_t))) {
        return 1; // Failed to read header
    }
    if (!std::cin.read(reinterpret_cast<char*>(&voxelSize), sizeof(float))) {
        return 1;
    }
    if (!std::cin.read(reinterpret_cast<char*>(&minX), sizeof(float))) {
        return 1;
    }
    if (!std::cin.read(reinterpret_cast<char*>(&minY), sizeof(float))) {
        return 1;
    }
    if (!std::cin.read(reinterpret_cast<char*>(&minZ), sizeof(float))) {
        return 1;
    }
    if (!std::cin.read(reinterpret_cast<char*>(&maxX), sizeof(float))) {
        return 1;
    }
    if (!std::cin.read(reinterpret_cast<char*>(&maxY), sizeof(float))) {
        return 1;
    }
    if (!std::cin.read(reinterpret_cast<char*>(&maxZ), sizeof(float))) {
        return 1;
    }
    
    // Validate input
    if (pointCount == 0 || voxelSize <= 0) {
        // Write empty result (4 bytes: outputCount = 0)
        uint32_t outputCount = 0;
        std::cout.write(reinterpret_cast<const char*>(&outputCount), sizeof(uint32_t));
        std::cout.flush();
        return 0;
    }
    
    // Read point data directly into vector (zero-copy where possible)
    const size_t floatCount = pointCount * 3;
    std::vector<float> pointCloudData(floatCount);
    
    if (!std::cin.read(reinterpret_cast<char*>(pointCloudData.data()), floatCount * sizeof(float))) {
        return 1; // Failed to read point data
    }
    
    float* inputData = pointCloudData.data();
    
    // Start timing (measure only processing, not I/O)
    auto startTime = std::chrono::high_resolution_clock::now();
    
    // OPTIMIZED C++ voxel downsampling - use contiguous memory for cache efficiency
    float invVoxelSize = 1.0f / voxelSize;
    
    // OPTIMIZATION 1: Reserve capacity for unordered_map to avoid rehashing (matches WASM)
    // Estimate: ~1% of points become voxels (rough estimate based on typical downsampling)
    int estimatedVoxels = pointCount / 100;
    if (estimatedVoxels < 100) estimatedVoxels = 100; // Minimum capacity
    std::unordered_map<uint64_t, Voxel> voxelMap;
    voxelMap.reserve(estimatedVoxels);
    
    const int CHUNK_SIZE = 1024;
    // Process from contiguous memory - maximum cache efficiency
    for (uint32_t chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        uint32_t chunkEnd = std::min(chunkStart + static_cast<uint32_t>(CHUNK_SIZE), pointCount);
        
        for (uint32_t i = chunkStart; i < chunkEnd; i++) {
            int i3 = i * 3;
            // Direct memory access - fastest possible
            float x = inputData[i3];
            float y = inputData[i3 + 1];
            float z = inputData[i3 + 2];
            
            // Use floor() to match TypeScript/Rust Math.floor() behavior
            int voxelX = static_cast<int>(std::floor((x - minX) * invVoxelSize));
            int voxelY = static_cast<int>(std::floor((y - minY) * invVoxelSize));
            int voxelZ = static_cast<int>(std::floor((z - minZ) * invVoxelSize));
            
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                               (static_cast<uint64_t>(voxelY) << 16) |
                               static_cast<uint64_t>(voxelZ);
            
            // OPTIMIZATION 2: Use try_emplace with struct initializer (matches WASM)
            // This is more efficient than default-constructing then assigning
            auto [it, inserted] = voxelMap.try_emplace(voxelKey, 1, x, y, z);
            if (!inserted) {
                // Existing entry - update (more common case, so optimize for this)
                Voxel& voxel = it->second;
                voxel.count++;
                voxel.sumX += x;
                voxel.sumY += y;
                voxel.sumZ += z;
            }
        }
    }
    
    // OPTIMIZATION 3: Pre-allocate output vector and write directly (matches WASM)
    // This avoids push_back reallocation overhead
    int outputCount = voxelMap.size();
    std::vector<float> downsampledPoints;
    downsampledPoints.resize(outputCount * 3); // Pre-allocate exact size
    
    // Write results directly to pre-allocated vector (like WASM writes to output buffer)
    int outputIndex = 0;
    for (const auto& [voxelKey, voxel] : voxelMap) {
        float count_f = static_cast<float>(voxel.count);
        downsampledPoints[outputIndex * 3] = voxel.sumX / count_f;
        downsampledPoints[outputIndex * 3 + 1] = voxel.sumY / count_f;
        downsampledPoints[outputIndex * 3 + 2] = voxel.sumZ / count_f;
        outputIndex++;
    }
    
    // OPTIMIZATION: Write binary output instead of JSON (much faster!)
    // Binary format: [uint32_t outputCount][float* downsampledPoints]
    
    // Write output count (4 bytes)
    uint32_t outputCount_u32 = static_cast<uint32_t>(outputCount);
    std::cout.write(reinterpret_cast<const char*>(&outputCount_u32), sizeof(uint32_t));
    
    // Write downsampled points directly (binary, no serialization overhead!)
    std::cout.write(reinterpret_cast<const char*>(downsampledPoints.data()), downsampledPoints.size() * sizeof(float));
    
    // Flush to ensure data is sent
    std::cout.flush();
    
    return 0;
}
