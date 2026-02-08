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
// Input format (extended): [uint32_t pointCount][float voxelSize][float minX..maxZ][uint32_t flags][float* positions][optional colors][optional intensities][optional classifications]
// flags: bit0=colors, bit1=intensity, bit2=classification
// Output format: [uint32_t outputCount][float* positions][optional colors][optional intensities][optional classifications]

// Use struct instead of tuple for better cache locality
struct Voxel {
    int count;
    float sumX, sumY, sumZ;
    Voxel() : count(0), sumX(0), sumY(0), sumZ(0) {}
    Voxel(int c, float x, float y, float z) : count(c), sumX(x), sumY(y), sumZ(z) {}
};

struct ClassCounts {
    std::unordered_map<uint8_t, int> counts;
    void add(uint8_t c) { counts[c]++; }
    uint8_t mode() const {
        int maxCount = 0;
        uint8_t best = 0;
        for (const auto& [cls, n] : counts) {
            if (n > maxCount) { maxCount = n; best = cls; }
        }
        return best;
    }
};

struct VoxelFull {
    int count;
    float sumX, sumY, sumZ, sumR, sumG, sumB, sumIntensity;
    ClassCounts classCounts;
    VoxelFull() : count(0), sumX(0), sumY(0), sumZ(0), sumR(0), sumG(0), sumB(0), sumIntensity(0) {}
};

int main() {
    // Extended header: 36 bytes (32 + 4 for flags). Old 32-byte header is still supported (flags=0).
    alignas(4) char header[36];
    if (!std::cin.read(header, 36) || std::cin.gcount() != 36) {
        return 1;
    }
    uint32_t pointCount;
    float voxelSize, minX, minY, minZ, maxX, maxY, maxZ;
    uint32_t flags = 0;
    std::memcpy(&pointCount, &header[0], sizeof(uint32_t));
    std::memcpy(&voxelSize, &header[4], sizeof(float));
    std::memcpy(&minX, &header[8], sizeof(float));
    std::memcpy(&minY, &header[12], sizeof(float));
    std::memcpy(&minZ, &header[16], sizeof(float));
    std::memcpy(&maxX, &header[20], sizeof(float));
    std::memcpy(&maxY, &header[24], sizeof(float));
    std::memcpy(&maxZ, &header[28], sizeof(float));
    std::memcpy(&flags, &header[32], sizeof(uint32_t));

    const bool useColors = (flags & 1) != 0;
    const bool useIntensity = (flags & 2) != 0;
    const bool useClassification = (flags & 4) != 0;

    if (pointCount == 0 || voxelSize <= 0) {
        uint32_t zero = 0;
        std::cout.write(reinterpret_cast<const char*>(&zero), sizeof(uint32_t));
        std::cout.flush();
        return 0;
    }

    const size_t floatCount = pointCount * 3;
    std::vector<float> pointCloudData(floatCount);
    if (!std::cin.read(reinterpret_cast<char*>(pointCloudData.data()), floatCount * sizeof(float))) {
        return 1;
    }
    float* inputData = pointCloudData.data();

    std::vector<float> inputColors;
    std::vector<float> inputIntensities;
    std::vector<uint8_t> inputClassifications;
    if (useColors) {
        inputColors.resize(floatCount);
        if (!std::cin.read(reinterpret_cast<char*>(inputColors.data()), floatCount * sizeof(float))) return 1;
    }
    if (useIntensity) {
        inputIntensities.resize(pointCount);
        if (!std::cin.read(reinterpret_cast<char*>(inputIntensities.data()), pointCount * sizeof(float))) return 1;
    }
    if (useClassification) {
        inputClassifications.resize(pointCount);
        if (!std::cin.read(reinterpret_cast<char*>(inputClassifications.data()), pointCount)) return 1;
    }

    auto startTime = std::chrono::high_resolution_clock::now();
    float invVoxelSize = 1.0f / voxelSize;

    if (!useColors && !useIntensity && !useClassification) {
        // Positions-only path (original)
        int estimatedVoxels = pointCount / 100;
        if (estimatedVoxels < 100) estimatedVoxels = 100;
        std::unordered_map<uint64_t, Voxel, FastHash> voxelMap;
        voxelMap.reserve(estimatedVoxels);
        const int CHUNK_SIZE = 1024;
        for (uint32_t chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
            uint32_t chunkEnd = std::min(chunkStart + static_cast<uint32_t>(CHUNK_SIZE), pointCount);
            for (uint32_t i = chunkStart; i < chunkEnd; i++) {
                int i3 = i * 3;
                float x = inputData[i3], y = inputData[i3 + 1], z = inputData[i3 + 2];
                int voxelX = static_cast<int>(std::floor((x - minX) * invVoxelSize));
                int voxelY = static_cast<int>(std::floor((y - minY) * invVoxelSize));
                int voxelZ = static_cast<int>(std::floor((z - minZ) * invVoxelSize));
                uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) | (static_cast<uint64_t>(voxelY) << 16) | static_cast<uint64_t>(voxelZ);
                auto [it, inserted] = voxelMap.try_emplace(voxelKey, 1, x, y, z);
                if (!inserted) {
                    Voxel& v = it->second;
                    v.count++;
                    v.sumX += x; v.sumY += y; v.sumZ += z;
                }
            }
        }
        int outputCount = voxelMap.size();
        std::vector<float> downsampledPoints(outputCount * 3);
        int outputIndex = 0;
        for (const auto& [voxelKey, voxel] : voxelMap) {
            float c = static_cast<float>(voxel.count);
            downsampledPoints[outputIndex * 3] = voxel.sumX / c;
            downsampledPoints[outputIndex * 3 + 1] = voxel.sumY / c;
            downsampledPoints[outputIndex * 3 + 2] = voxel.sumZ / c;
            outputIndex++;
        }
        auto endTime = std::chrono::high_resolution_clock::now();
        auto processingTime = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();
        std::cerr << "C++ BE computation time: " << processingTime << " ms" << std::endl;
        uint32_t outCount = static_cast<uint32_t>(outputCount);
        std::cout.write(reinterpret_cast<const char*>(&outCount), sizeof(uint32_t));
        std::cout.write(reinterpret_cast<const char*>(downsampledPoints.data()), downsampledPoints.size() * sizeof(float));
        std::cout.flush();
        return 0;
    }

    // Full attributes path
    int estimatedVoxels = pointCount / 100;
    if (estimatedVoxels < 100) estimatedVoxels = 100;
    std::unordered_map<uint64_t, VoxelFull, FastHash> voxelMap;
    voxelMap.reserve(estimatedVoxels);
    const int CHUNK_SIZE = 1024;
    float* colorsPtr = useColors ? inputColors.data() : nullptr;
    float* intensitiesPtr = useIntensity ? inputIntensities.data() : nullptr;
    uint8_t* classificationsPtr = useClassification ? inputClassifications.data() : nullptr;

    for (uint32_t chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        uint32_t chunkEnd = std::min(chunkStart + static_cast<uint32_t>(CHUNK_SIZE), pointCount);
        for (uint32_t i = chunkStart; i < chunkEnd; i++) {
            int i3 = i * 3;
            float x = inputData[i3], y = inputData[i3 + 1], z = inputData[i3 + 2];
            int voxelX = static_cast<int>(std::floor((x - minX) * invVoxelSize));
            int voxelY = static_cast<int>(std::floor((y - minY) * invVoxelSize));
            int voxelZ = static_cast<int>(std::floor((z - minZ) * invVoxelSize));
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) | (static_cast<uint64_t>(voxelY) << 16) | static_cast<uint64_t>(voxelZ);

            auto it = voxelMap.find(voxelKey);
            if (it == voxelMap.end()) {
                VoxelFull v;
                v.count = 1;
                v.sumX = x; v.sumY = y; v.sumZ = z;
                if (useColors) { v.sumR = colorsPtr[i3]; v.sumG = colorsPtr[i3 + 1]; v.sumB = colorsPtr[i3 + 2]; }
                if (useIntensity) v.sumIntensity = intensitiesPtr[i];
                if (useClassification) v.classCounts.add(classificationsPtr[i]);
                voxelMap[voxelKey] = v;
            } else {
                VoxelFull& v = it->second;
                v.count++;
                v.sumX += x; v.sumY += y; v.sumZ += z;
                if (useColors) { v.sumR += colorsPtr[i3]; v.sumG += colorsPtr[i3 + 1]; v.sumB += colorsPtr[i3 + 2]; }
                if (useIntensity) v.sumIntensity += intensitiesPtr[i];
                if (useClassification) v.classCounts.add(classificationsPtr[i]);
            }
        }
    }

    int outputCount = voxelMap.size();
    std::vector<float> downsampledPoints(outputCount * 3);
    std::vector<float> downsampledColors(useColors ? outputCount * 3 : 0);
    std::vector<float> downsampledIntensities(useIntensity ? outputCount : 0);
    std::vector<uint8_t> downsampledClassifications(useClassification ? outputCount : 0);

    int outputIndex = 0;
    for (const auto& [voxelKey, voxel] : voxelMap) {
        float c = static_cast<float>(voxel.count);
        downsampledPoints[outputIndex * 3] = voxel.sumX / c;
        downsampledPoints[outputIndex * 3 + 1] = voxel.sumY / c;
        downsampledPoints[outputIndex * 3 + 2] = voxel.sumZ / c;
        if (useColors) {
            downsampledColors[outputIndex * 3] = voxel.sumR / c;
            downsampledColors[outputIndex * 3 + 1] = voxel.sumG / c;
            downsampledColors[outputIndex * 3 + 2] = voxel.sumB / c;
        }
        if (useIntensity) downsampledIntensities[outputIndex] = voxel.sumIntensity / c;
        if (useClassification) downsampledClassifications[outputIndex] = voxel.classCounts.mode();
        outputIndex++;
    }

    auto endTime = std::chrono::high_resolution_clock::now();
    auto processingTime = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();
    std::cerr << "C++ BE computation time: " << processingTime << " ms" << std::endl;

    uint32_t outCount = static_cast<uint32_t>(outputCount);
    std::cout.write(reinterpret_cast<const char*>(&outCount), sizeof(uint32_t));
    std::cout.write(reinterpret_cast<const char*>(downsampledPoints.data()), downsampledPoints.size() * sizeof(float));
    if (useColors) std::cout.write(reinterpret_cast<const char*>(downsampledColors.data()), downsampledColors.size() * sizeof(float));
    if (useIntensity) std::cout.write(reinterpret_cast<const char*>(downsampledIntensities.data()), downsampledIntensities.size() * sizeof(float));
    if (useClassification) std::cout.write(reinterpret_cast<const char*>(downsampledClassifications.data()), downsampledClassifications.size());
    std::cout.flush();
    return 0;
}
