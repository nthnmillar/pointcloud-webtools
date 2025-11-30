#include <iostream>
#include <vector>
#include <cmath>
#include <algorithm>
#include <cstdint>
#include <cstring>
#include "../voxel_downsample/include/ankerl/unordered_dense.h"

// Fast hash function for 64-bit integers (matches Rust's FxHash exactly)
struct FastHash {
    size_t operator()(uint64_t x) const noexcept {
        constexpr uint64_t K = 0x517cc1b727220a95ULL;
        x = x * K;
        x = (x << 5) | (x >> 59);
        return static_cast<size_t>(x);
    }
};

// Binary protocol for fast I/O (replaces text I/O)
// Input format: [uint32_t pointCount][float voxelSize][float minX][float minY][float minZ][float maxX][float maxY][float maxZ][float* pointData]
// Output format: [uint32_t voxelCount][float* voxelGridPositions]

int main() {
    // OPTIMIZATION: Read binary input instead of text (much faster!)
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
        // Write empty result (4 bytes: voxelCount = 0)
        uint32_t voxelCount = 0;
        std::cout.write(reinterpret_cast<const char*>(&voxelCount), sizeof(uint32_t));
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
    
    // ULTRA OPTIMIZED C++ voxel debug algorithm - matches WASM version
    // OPTIMIZATION 1: Pre-calculate ALL constants at the start (like Rust/WASM does)
    float invVoxelSize = 1.0f / voxelSize;
    float halfVoxelSize = voxelSize * 0.5f;
    float offsetX = minX + halfVoxelSize;
    float offsetY = minY + halfVoxelSize;
    float offsetZ = minZ + halfVoxelSize;
    
    // OPTIMIZATION 2: Use ankerl::unordered_dense::set with FastHash (fast hash set, matches Rust FxHash performance)
    // Don't reserve - let it grow naturally like Rust/WASM (reserve can cause overhead if estimate is wrong)
    ankerl::unordered_dense::set<uint64_t, FastHash> voxelKeys;
    
    // OPTIMIZATION 3: Process points in chunks for better cache locality
    const int CHUNK_SIZE = 1024;
    for (uint32_t chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        uint32_t chunkEnd = std::min(chunkStart + CHUNK_SIZE, pointCount);
        
        for (uint32_t i = chunkStart; i < chunkEnd; i++) {
            int i3 = i * 3;
            float x = inputData[i3];
            float y = inputData[i3 + 1];
            float z = inputData[i3 + 2];
            
            // OPTIMIZATION 4: Use floor and multiplication instead of division
            int voxelX = static_cast<int>(std::floor((x - minX) * invVoxelSize));
            int voxelY = static_cast<int>(std::floor((y - minY) * invVoxelSize));
            int voxelZ = static_cast<int>(std::floor((z - minZ) * invVoxelSize));
            
            // OPTIMIZATION 5: Create integer hash key (same as WASM)
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                               (static_cast<uint64_t>(voxelY) << 16) |
                               static_cast<uint64_t>(voxelZ);
            
            // OPTIMIZATION 6: Store unique voxel keys only (same as WASM)
            // Use emplace to avoid copy (construct in-place)
            voxelKeys.emplace(voxelKey);
        }
    }
    
    // OPTIMIZATION 7: Pre-allocate result vector
    std::vector<float> voxelGridPositions;
    voxelGridPositions.resize(voxelKeys.size() * 3); // Pre-allocate exact size
    
    // OPTIMIZATION 8: Single pass conversion with pointer arithmetic (like WASM)
    // Use pointer arithmetic for maximum performance (like optimized voxel downsampling)
    float* outputPtr = voxelGridPositions.data();
    
    for (const uint64_t voxelKey : voxelKeys) {
        // Extract voxel coordinates from integer key (optimized bit operations, same as WASM)
        // voxelX: bits 32-63 (32 bits), voxelY: bits 16-31 (16 bits), voxelZ: bits 0-15 (16 bits)
        int voxelX = static_cast<int32_t>(voxelKey >> 32);
        int voxelY = static_cast<int16_t>((voxelKey >> 16) & 0xFFFF); // Sign-extend 16-bit to int
        int voxelZ = static_cast<int16_t>(voxelKey & 0xFFFF); // Sign-extend 16-bit to int
        
        // Calculate voxel grid position (center of voxel grid cell) - direct calculation and write
        *outputPtr++ = offsetX + static_cast<float>(voxelX) * voxelSize;
        *outputPtr++ = offsetY + static_cast<float>(voxelY) * voxelSize;
        *outputPtr++ = offsetZ + static_cast<float>(voxelZ) * voxelSize;
    }
    
    // OPTIMIZATION 10: Write binary output instead of text (much faster!)
    // Binary format: [uint32_t voxelCount][float* voxelGridPositions]
    uint32_t voxelCount = static_cast<uint32_t>(voxelKeys.size());
    std::cout.write(reinterpret_cast<const char*>(&voxelCount), sizeof(uint32_t));
    std::cout.write(reinterpret_cast<const char*>(voxelGridPositions.data()), voxelGridPositions.size() * sizeof(float));
    std::cout.flush();
    
    return 0;
}
