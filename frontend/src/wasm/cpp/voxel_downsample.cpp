#include <vector>
#include <unordered_map>
#include <cmath>
#include <cstdint>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "common.h"

// Forward declarations
int voxelDownsampleInternal(float* inputData, int pointCount, float voxelSize,
                           float globalMinX, float globalMinY, float globalMinZ, float* outputData);
int voxelDownsampleWithColorsInternal(float* inputData, float* inputColors,
    int pointCount, float voxelSize, float globalMinX, float globalMinY, float globalMinZ,
    float* outputData, float* outputColors);
int voxelDownsampleWithAttributesInternal(
    float* inputData, float* inputColors, float* inputIntensities, uint8_t* inputClassifications,
    int pointCount, float voxelSize, float globalMinX, float globalMinY, float globalMinZ,
    float* outputData, float* outputColors, float* outputIntensities, uint8_t* outputClassifications);

extern "C" {
    // Direct pointer-based voxel downsampling for zero-copy input access
    int voxelDownsampleDirect(
        float* inputPtr,
        int pointCount,
        float voxelSize,
        float globalMinX,
        float globalMinY,
        float globalMinZ,
        float* outputPtr
    ) {
        if (!inputPtr || !outputPtr || pointCount <= 0 || voxelSize <= 0) {
            return 0;
        }
        return voxelDownsampleInternal(
            inputPtr, pointCount, voxelSize,
            globalMinX, globalMinY, globalMinZ,
            outputPtr
        );
    }

    // Voxel downsampling with optional colors: averages RGB per voxel.
    int voxelDownsampleDirectWithColors(
        float* inputPtr,
        float* inputColors,
        int pointCount,
        float voxelSize,
        float globalMinX,
        float globalMinY,
        float globalMinZ,
        float* outputPtr,
        float* outputColors
    ) {
        if (!inputPtr || !outputPtr || pointCount <= 0 || voxelSize <= 0) {
            return 0;
        }
        return voxelDownsampleWithColorsInternal(
            inputPtr, inputColors, pointCount, voxelSize,
            globalMinX, globalMinY, globalMinZ,
            outputPtr, outputColors
        );
    }

    // Full attributes: positions + optional colors, intensities, classifications.
    // Null pointers for any attribute skip that attribute. Intensity = average per voxel; classification = mode (most frequent) per voxel.
    int voxelDownsampleDirectWithAttributes(
        float* inputPtr,
        float* inputColors,
        float* inputIntensities,
        uint8_t* inputClassifications,
        int pointCount,
        float voxelSize,
        float globalMinX,
        float globalMinY,
        float globalMinZ,
        float* outputPtr,
        float* outputColors,
        float* outputIntensities,
        uint8_t* outputClassifications
    ) {
        if (!inputPtr || !outputPtr || pointCount <= 0 || voxelSize <= 0) {
            return 0;
        }
        return voxelDownsampleWithAttributesInternal(
            inputPtr, inputColors, inputIntensities, inputClassifications,
            pointCount, voxelSize, globalMinX, globalMinY, globalMinZ,
            outputPtr, outputColors, outputIntensities, outputClassifications
        );
    }
}

// Optimized voxel downsampling function - returns Float32Array directly
emscripten::val voxelDownsample(
    const emscripten::val& inputPoints, 
    float voxelSize,
    float globalMinX = 0.0f,
    float globalMinY = 0.0f,
    float globalMinZ = 0.0f
) {
    if (inputPoints.isNull() || inputPoints.isUndefined() || voxelSize <= 0) {
        return emscripten::val::global("Float32Array").new_();
    }
    
    int length = inputPoints["length"].as<int>();
    int pointCount = length / 3;
    
    if (length <= 0 || length % 3 != 0) {
        return emscripten::val::global("Float32Array").new_();
    }
    
    // OPTIMIZATION: Copy input data efficiently
    // Note: Direct memory access requires the Float32Array to be in WASM memory
    // Since it's passed from JS, we need to copy it to WASM memory
    float* inputPtr = (float*)malloc(length * sizeof(float));
    
    // Copy input data efficiently - element-by-element is necessary when
    // the Float32Array is not in WASM memory
    for (int i = 0; i < length; i++) {
        inputPtr[i] = inputPoints.call<float>("at", i);
    }
    
    // Allocate output buffer
    float* outputPtr = (float*)malloc(length * sizeof(float));
    
    // Call the optimized function
    int outputCount = voxelDownsampleInternal(
        inputPtr, 
        pointCount, 
        voxelSize, 
        globalMinX, 
        globalMinY, 
        globalMinZ, 
        outputPtr
    );
    
    // Create Float32Array directly from output buffer - use .set() method
    emscripten::val resultArray = emscripten::val::global("Float32Array").new_(outputCount * 3);
    
    // Copy directly from output buffer to result array using .set()
    for (int i = 0; i < outputCount * 3; i++) {
        resultArray.set(i, outputPtr[i]);
    }
    
    // Free allocated memory
    free(inputPtr);
    free(outputPtr);
    
    return resultArray;
}

// Ultra-optimized voxel downsampling with direct memory access
int voxelDownsampleInternal(
    float* inputData, 
    int pointCount, 
    float voxelSize, 
    float globalMinX, 
    float globalMinY, 
    float globalMinZ,
    float* outputData
) {
    if (!inputData || !outputData || pointCount <= 0 || voxelSize <= 0) {
        return 0;
    }

    // Pre-calculate inverse voxel size to avoid division
    float invVoxelSize = 1.0f / voxelSize;

    // Use integer hash for maximum performance
    struct Voxel {
        int count;
        float sumX, sumY, sumZ;
        Voxel() : count(0), sumX(0), sumY(0), sumZ(0) {}
        // Constructor for efficient initialization
        Voxel(int c, float x, float y, float z) : count(c), sumX(x), sumY(y), sumZ(z) {}
    };
    
    // OPTIMIZATION 1: Reserve capacity for unordered_map to avoid rehashing
    // Use FastHash (matching Rust's FxHash) for better performance
    // Estimate: ~1% of points become voxels (rough estimate based on typical downsampling)
    int estimatedVoxels = pointCount / 100;
    if (estimatedVoxels < 100) estimatedVoxels = 100; // Minimum capacity
    std::unordered_map<uint64_t, Voxel, FastHash> voxelMap;
    voxelMap.reserve(estimatedVoxels);
    
    // OPTIMIZATION 2: Process points in chunks for better cache locality
    const int CHUNK_SIZE = 1024;
    for (int chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        int chunkEnd = (chunkStart + CHUNK_SIZE < pointCount) ? chunkStart + CHUNK_SIZE : pointCount;
        
        for (int i = chunkStart; i < chunkEnd; i++) {
            int i3 = i * 3;
            float x = inputData[i3];
            float y = inputData[i3 + 1];
            float z = inputData[i3 + 2];
            
            // Calculate voxel coordinates - use floor() to match TypeScript/Rust Math.floor()
            int voxelX = static_cast<int>(std::floor((x - globalMinX) * invVoxelSize));
            int voxelY = static_cast<int>(std::floor((y - globalMinY) * invVoxelSize));
            int voxelZ = static_cast<int>(std::floor((z - globalMinZ) * invVoxelSize));
            
            // Create integer hash key - much faster than string
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) | 
                               (static_cast<uint64_t>(voxelY) << 16) | 
                               static_cast<uint64_t>(voxelZ);
            
            // OPTIMIZATION 3: Use try_emplace with initializer to avoid default construction
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
    
    // Write results directly to output buffer
    int outputIndex = 0;
    for (const auto& [voxelKey, voxel] : voxelMap) {
        outputData[outputIndex * 3] = voxel.sumX / voxel.count;
        outputData[outputIndex * 3 + 1] = voxel.sumY / voxel.count;
        outputData[outputIndex * 3 + 2] = voxel.sumZ / voxel.count;
        outputIndex++;
    }
    
    return outputIndex; // Return number of output points
}

// Voxel downsampling with color averaging per voxel
int voxelDownsampleWithColorsInternal(
    float* inputData,
    float* inputColors,
    int pointCount,
    float voxelSize,
    float globalMinX,
    float globalMinY,
    float globalMinZ,
    float* outputData,
    float* outputColors
) {
    if (!inputData || !outputData || pointCount <= 0 || voxelSize <= 0) {
        return 0;
    }
    const bool useColors = (inputColors != nullptr && outputColors != nullptr);

    float invVoxelSize = 1.0f / voxelSize;

    struct VoxelWithColor {
        int count;
        float sumX, sumY, sumZ;
        float sumR, sumG, sumB;
        VoxelWithColor() : count(0), sumX(0), sumY(0), sumZ(0), sumR(0), sumG(0), sumB(0) {}
    };
    std::unordered_map<uint64_t, VoxelWithColor, FastHash> voxelMap;
    int estimatedVoxels = pointCount / 100;
    if (estimatedVoxels < 100) estimatedVoxels = 100;
    voxelMap.reserve(estimatedVoxels);

    const int CHUNK_SIZE = 1024;
    for (int chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        int chunkEnd = (chunkStart + CHUNK_SIZE < pointCount) ? chunkStart + CHUNK_SIZE : pointCount;
        for (int i = chunkStart; i < chunkEnd; i++) {
            int i3 = i * 3;
            float x = inputData[i3];
            float y = inputData[i3 + 1];
            float z = inputData[i3 + 2];
            int voxelX = static_cast<int>(std::floor((x - globalMinX) * invVoxelSize));
            int voxelY = static_cast<int>(std::floor((y - globalMinY) * invVoxelSize));
            int voxelZ = static_cast<int>(std::floor((z - globalMinZ) * invVoxelSize));
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                               (static_cast<uint64_t>(voxelY) << 16) |
                               static_cast<uint64_t>(voxelZ);

            auto it = voxelMap.find(voxelKey);
            if (it == voxelMap.end()) {
                VoxelWithColor v;
                v.count = 1;
                v.sumX = x; v.sumY = y; v.sumZ = z;
                if (useColors) {
                    v.sumR = inputColors[i3];
                    v.sumG = inputColors[i3 + 1];
                    v.sumB = inputColors[i3 + 2];
                }
                voxelMap[voxelKey] = v;
            } else {
                VoxelWithColor& v = it->second;
                v.count++;
                v.sumX += x; v.sumY += y; v.sumZ += z;
                if (useColors) {
                    v.sumR += inputColors[i3];
                    v.sumG += inputColors[i3 + 1];
                    v.sumB += inputColors[i3 + 2];
                }
            }
        }
    }

    int outputIndex = 0;
    for (const auto& [voxelKey, voxel] : voxelMap) {
        outputData[outputIndex * 3] = voxel.sumX / voxel.count;
        outputData[outputIndex * 3 + 1] = voxel.sumY / voxel.count;
        outputData[outputIndex * 3 + 2] = voxel.sumZ / voxel.count;
        if (useColors) {
            outputColors[outputIndex * 3] = voxel.sumR / voxel.count;
            outputColors[outputIndex * 3 + 1] = voxel.sumG / voxel.count;
            outputColors[outputIndex * 3 + 2] = voxel.sumB / voxel.count;
        }
        outputIndex++;
    }
    return outputIndex;
}

// Full attributes: colors (average), intensity (average), classification (mode per voxel)
int voxelDownsampleWithAttributesInternal(
    float* inputData,
    float* inputColors,
    float* inputIntensities,
    uint8_t* inputClassifications,
    int pointCount,
    float voxelSize,
    float globalMinX,
    float globalMinY,
    float globalMinZ,
    float* outputData,
    float* outputColors,
    float* outputIntensities,
    uint8_t* outputClassifications
) {
    if (!inputData || !outputData || pointCount <= 0 || voxelSize <= 0) {
        return 0;
    }
    const bool useColors = (inputColors != nullptr && outputColors != nullptr);
    const bool useIntensity = (inputIntensities != nullptr && outputIntensities != nullptr);
    const bool useClassification = (inputClassifications != nullptr && outputClassifications != nullptr);

    float invVoxelSize = 1.0f / voxelSize;

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
    std::unordered_map<uint64_t, VoxelFull, FastHash> voxelMap;
    int estimatedVoxels = pointCount / 100;
    if (estimatedVoxels < 100) estimatedVoxels = 100;
    voxelMap.reserve(estimatedVoxels);

    const int CHUNK_SIZE = 1024;
    for (int chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        int chunkEnd = (chunkStart + CHUNK_SIZE < pointCount) ? chunkStart + CHUNK_SIZE : pointCount;
        for (int i = chunkStart; i < chunkEnd; i++) {
            int i3 = i * 3;
            float x = inputData[i3];
            float y = inputData[i3 + 1];
            float z = inputData[i3 + 2];
            int voxelX = static_cast<int>(std::floor((x - globalMinX) * invVoxelSize));
            int voxelY = static_cast<int>(std::floor((y - globalMinY) * invVoxelSize));
            int voxelZ = static_cast<int>(std::floor((z - globalMinZ) * invVoxelSize));
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                               (static_cast<uint64_t>(voxelY) << 16) |
                               static_cast<uint64_t>(voxelZ);

            auto it = voxelMap.find(voxelKey);
            if (it == voxelMap.end()) {
                VoxelFull v;
                v.count = 1;
                v.sumX = x; v.sumY = y; v.sumZ = z;
                if (useColors) {
                    v.sumR = inputColors[i3];
                    v.sumG = inputColors[i3 + 1];
                    v.sumB = inputColors[i3 + 2];
                }
                if (useIntensity) v.sumIntensity = inputIntensities[i];
                if (useClassification) v.classCounts.add(inputClassifications[i]);
                voxelMap[voxelKey] = v;
            } else {
                VoxelFull& v = it->second;
                v.count++;
                v.sumX += x; v.sumY += y; v.sumZ += z;
                if (useColors) {
                    v.sumR += inputColors[i3];
                    v.sumG += inputColors[i3 + 1];
                    v.sumB += inputColors[i3 + 2];
                }
                if (useIntensity) v.sumIntensity += inputIntensities[i];
                if (useClassification) v.classCounts.add(inputClassifications[i]);
            }
        }
    }

    int outputIndex = 0;
    for (const auto& [voxelKey, voxel] : voxelMap) {
        outputData[outputIndex * 3] = voxel.sumX / voxel.count;
        outputData[outputIndex * 3 + 1] = voxel.sumY / voxel.count;
        outputData[outputIndex * 3 + 2] = voxel.sumZ / voxel.count;
        if (useColors) {
            outputColors[outputIndex * 3] = voxel.sumR / voxel.count;
            outputColors[outputIndex * 3 + 1] = voxel.sumG / voxel.count;
            outputColors[outputIndex * 3 + 2] = voxel.sumB / voxel.count;
        }
        if (useIntensity) outputIntensities[outputIndex] = voxel.sumIntensity / voxel.count;
        if (useClassification) outputClassifications[outputIndex] = voxel.classCounts.mode();
        outputIndex++;
    }
    return outputIndex;
}

// Emscripten bindings for voxel downsampling
EMSCRIPTEN_BINDINGS(voxel_downsample_module) {
    emscripten::function("voxelDownsample", &voxelDownsample);
}

