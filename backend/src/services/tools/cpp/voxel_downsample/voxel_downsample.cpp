#include <iostream>
#include <vector>
#include <cmath>
#include <sstream>
#include <cstdint>
#include <chrono>
#include <algorithm>
#include <iomanip>
#include <cctype>
#include <cstring>
#include <unordered_map>

// Fast hash function for 64-bit integers (matches Rust's FxHash exactly)
// FxHash uses a simple multiply and rotate - very fast for integer keys
struct FastHash {
    size_t operator()(uint64_t x) const noexcept {
        // FxHash algorithm: multiply by magic constant and rotate
        // This is the actual FxHash implementation from rustc-hash
        constexpr uint64_t K = 0x517cc1b727220a95ULL;
        x = x * K;
        // Rotate left by 5 (equivalent to (x << 5) | (x >> 59))
        x = (x << 5) | (x >> 59);
        return static_cast<size_t>(x);
    }
};

// Binary protocol for fast I/O
// Input format: [uint32_t pointCount][float voxelSize][float minX][float minY][float minZ][float maxX][float maxY][float maxZ][float* pointData]
// Output format: [uint32_t outputCount][float* downsampledPoints]

// Use struct instead of tuple for better cache locality
struct Voxel {
    int count;
    float sumX, sumY, sumZ;
    Voxel() : count(0), sumX(0), sumY(0), sumZ(0) {}
    // Constructor for efficient initialization
    Voxel(int c, float x, float y, float z) : count(c), sumX(x), sumY(y), sumZ(z) {}
};

int main() {
    // Read binary input for fast I/O
    // Binary format: [uint32_t pointCount][float voxelSize][float minX][float minY][float minZ][float maxX][float maxY][float maxZ][float* pointData]
    
    // Read binary header in one read (32 bytes: 4 for uint32 + 7*4 for floats)
    // Single read is more efficient than multiple separate reads
    // Use aligned storage to avoid potential alignment issues
    alignas(4) char header[32];
    if (!std::cin.read(header, 32) || std::cin.gcount() != 32) {
        return 1; // Failed to read header
    }
    
    // Extract values from header (little-endian, safe unaligned access)
    uint32_t pointCount;
    float voxelSize, minX, minY, minZ, maxX, maxY, maxZ;
    std::memcpy(&pointCount, &header[0], sizeof(uint32_t));
    std::memcpy(&voxelSize, &header[4], sizeof(float));
    std::memcpy(&minX, &header[8], sizeof(float));
    std::memcpy(&minY, &header[12], sizeof(float));
    std::memcpy(&minZ, &header[16], sizeof(float));
    std::memcpy(&maxX, &header[20], sizeof(float));
    std::memcpy(&maxY, &header[24], sizeof(float));
    std::memcpy(&maxZ, &header[28], sizeof(float));
    
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
    
    // Use std::unordered_map with FastHash for fast integer key hashing
    // Use FastHash for integer keys (matches Rust FxHashMap)
    // Estimate: ~1% of points become voxels (rough estimate based on typical downsampling)
    int estimatedVoxels = pointCount / 100;
    if (estimatedVoxels < 100) estimatedVoxels = 100; // Minimum capacity
    std::unordered_map<uint64_t, Voxel, FastHash> voxelMap;
    voxelMap.reserve(estimatedVoxels); // Match WASM reserve amount
    
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
            
            // Calculate voxel coordinates - use floor() to match C++ WASM exactly
            int voxelX = static_cast<int>(std::floor((x - minX) * invVoxelSize));
            int voxelY = static_cast<int>(std::floor((y - minY) * invVoxelSize));
            int voxelZ = static_cast<int>(std::floor((z - minZ) * invVoxelSize));
            
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                               (static_cast<uint64_t>(voxelY) << 16) |
                               static_cast<uint64_t>(voxelZ);
            
            // Use try_emplace with struct initializer for efficient insertion
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
    
    // Pre-allocate output vector and write directly for efficiency
    // This avoids push_back reallocation overhead
    int outputCount = voxelMap.size();
    std::vector<float> downsampledPoints;
    downsampledPoints.resize(outputCount * 3); // Pre-allocate exact size
    
    // Write results directly to pre-allocated vector (matches C++ WASM exactly)
    int outputIndex = 0;
    for (const auto& [voxelKey, voxel] : voxelMap) {
        downsampledPoints[outputIndex * 3] = voxel.sumX / voxel.count;
        downsampledPoints[outputIndex * 3 + 1] = voxel.sumY / voxel.count;
        downsampledPoints[outputIndex * 3 + 2] = voxel.sumZ / voxel.count;
        outputIndex++;
    }
    
    // End timing (measure only processing, not I/O)
    auto endTime = std::chrono::high_resolution_clock::now();
    auto processingTime = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();
    
    // Write processing time to stderr for debugging (doesn't interfere with binary output)
    std::cerr << "C++ BE computation time: " << processingTime << " ms" << std::endl;
    
    // Write binary output for fast I/O
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
