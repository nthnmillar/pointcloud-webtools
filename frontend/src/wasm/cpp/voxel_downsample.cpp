#include <vector>
#include <unordered_map>
#include <cmath>
#include <cstdint>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "common.h"

// Forward declaration
int voxelDownsampleInternal(float* inputData, int pointCount, float voxelSize, 
                           float globalMinX, float globalMinY, float globalMinZ, float* outputData);

extern "C" {
    // Direct pointer-based voxel downsampling for zero-copy input access
    // JavaScript allocates memory, copies input data with HEAPF32.set(), calls this function,
    // then reads results from outputPtr using the existing Embind function
    int voxelDownsampleDirect(
        float* inputPtr,      // Pointer to input data in WASM heap (already copied via HEAPF32.set())
        int pointCount,        // Number of points (length / 3)
        float voxelSize,
        float globalMinX,
        float globalMinY,
        float globalMinZ,
        float* outputPtr      // Pointer to output buffer (pre-allocated, at least pointCount * 3 floats)
    ) {
        if (!inputPtr || !outputPtr || pointCount <= 0 || voxelSize <= 0) {
            return 0;
        }
        
        return voxelDownsampleInternal(
            inputPtr,
            pointCount,
            voxelSize,
            globalMinX,
            globalMinY,
            globalMinZ,
            outputPtr
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

// Emscripten bindings for voxel downsampling
EMSCRIPTEN_BINDINGS(voxel_downsample_module) {
    emscripten::function("voxelDownsample", &voxelDownsample);
}

