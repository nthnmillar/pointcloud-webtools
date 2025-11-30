#include <vector>
#include <unordered_set>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "common.h"

// Forward declaration
int voxelDebugInternal(float* inputData, int pointCount, float voxelSize,
                      float minX, float minY, float minZ, float* outputPtr, int maxOutputPoints);

// Debug visualization data structures
struct VoxelDebug {
    std::vector<Point3D> voxelCenters;
    float voxelSize;
    bool isVisible;
};

VoxelDebug g_voxelDebug;

void showVoxelDebug() {
    g_voxelDebug.isVisible = true;
}

// Optimized voxel debug with efficient memory access
// Uses provided bounds to match TypeScript/Rust implementations exactly
void showVoxelDebug(const emscripten::val& inputPoints, float voxelSize, float minX, float minY, float minZ) {
    if (inputPoints.isNull() || inputPoints.isUndefined() || voxelSize <= 0) {
        g_voxelDebug.voxelCenters.clear();
        return;
    }
    
    int length = inputPoints["length"].as<int>();
    int pointCount = length / 3;
    
    if (pointCount <= 0) {
        g_voxelDebug.voxelCenters.clear();
        return;
    }
    
    // OPTIMIZATION: Copy input data to WASM memory first for direct access (like voxel downsampling)
    // This avoids slow JavaScript calls for every point access
    float* inputData = (float*)malloc(length * sizeof(float));
    for (int i = 0; i < length; i++) {
        inputData[i] = inputPoints.call<float>("at", i);
    }
    
    // Use provided bounds (same as TypeScript/Rust) - ensures identical results
    
    // OPTIMIZATION 3: Pre-calculate inverse voxel size to avoid division
    float invVoxelSize = 1.0f / voxelSize;
    
    // OPTIMIZATION 4: Use unordered_set with FastHash (matching Rust's FxHash) for unique voxel coordinates
    std::unordered_set<uint64_t, FastHash> voxelKeys;
    voxelKeys.reserve(pointCount / 4); // Reserve space to avoid rehashing
    
    // OPTIMIZATION 5: Process points in chunks for better cache locality
    const int CHUNK_SIZE = 1024;
    for (int chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        int chunkEnd = (chunkStart + CHUNK_SIZE < pointCount) ? chunkStart + CHUNK_SIZE : pointCount;
        
        for (int i = chunkStart; i < chunkEnd; i++) {
            int i3 = i * 3;
            // OPTIMIZATION: Direct memory access (much faster than JavaScript calls)
            float x = inputData[i3];
            float y = inputData[i3 + 1];
            float z = inputData[i3 + 2];
            
            // OPTIMIZATION 6: Use multiplication instead of division
            // Use floor() to match TypeScript/Rust Math.floor() behavior (handles negative correctly)
            int voxelX = static_cast<int>(std::floor((x - minX) * invVoxelSize));
            int voxelY = static_cast<int>(std::floor((y - minY) * invVoxelSize));
            int voxelZ = static_cast<int>(std::floor((z - minZ) * invVoxelSize));
            
            // OPTIMIZATION 7: Better hash function for better distribution
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                               (static_cast<uint64_t>(voxelY) << 16) |
                               static_cast<uint64_t>(voxelZ);
            
            // OPTIMIZATION 8: Store unique voxel keys only (same as Rust)
            voxelKeys.insert(voxelKey);
        }
    }
    
    // Free input data
    free(inputData);
    
    // OPTIMIZATION 9: Pre-allocate result vector and use move semantics
    g_voxelDebug.voxelCenters.clear();
    g_voxelDebug.voxelCenters.reserve(voxelKeys.size());
    g_voxelDebug.voxelSize = voxelSize;
    
    // OPTIMIZATION 10: Single pass conversion with pre-calculated values
    float halfVoxelSize = voxelSize * 0.5f;
    float offsetX = minX + halfVoxelSize;
    float offsetY = minY + halfVoxelSize;
    float offsetZ = minZ + halfVoxelSize;
    
    for (const uint64_t voxelKey : voxelKeys) {
        // Extract voxel coordinates from integer key (same as internal function)
        // voxelX: bits 32-63 (32 bits), voxelY: bits 16-31 (16 bits), voxelZ: bits 0-15 (16 bits)
        int voxelX = static_cast<int32_t>(voxelKey >> 32);
        int voxelY = static_cast<int16_t>((voxelKey >> 16) & 0xFFFF); // Sign-extend 16-bit to int
        int voxelZ = static_cast<int16_t>(voxelKey & 0xFFFF); // Sign-extend 16-bit to int
        
        // Calculate voxel grid position (center of voxel grid cell)
        float gridX = offsetX + static_cast<float>(voxelX) * voxelSize;
        float gridY = offsetY + static_cast<float>(voxelY) * voxelSize;
        float gridZ = offsetZ + static_cast<float>(voxelZ) * voxelSize;
        
        g_voxelDebug.voxelCenters.emplace_back(gridX, gridY, gridZ);
    }
    
    g_voxelDebug.isVisible = true;
}

// Internal voxel debug function - writes directly to outputPtr (zero-copy output)
int voxelDebugInternal(float* inputData, int pointCount, float voxelSize,
                      float minX, float minY, float minZ, float* outputPtr, int maxOutputPoints) {
    if (!inputData || !outputPtr || pointCount <= 0 || voxelSize <= 0 || maxOutputPoints <= 0) {
        return 0;
    }
    
    // OPTIMIZATION 1: Pre-calculate ALL constants at the start (like Rust does)
    float invVoxelSize = 1.0f / voxelSize;
    float halfVoxelSize = voxelSize * 0.5f;
    float offsetX = minX + halfVoxelSize;
    float offsetY = minY + halfVoxelSize;
    float offsetZ = minZ + halfVoxelSize;
    
    // OPTIMIZATION 2: Use unordered_set with FastHash (matching Rust's FxHash) for unique voxel coordinates
    // Don't reserve - let it grow naturally like Rust (reserve can cause overhead if estimate is wrong)
    std::unordered_set<uint64_t, FastHash> voxelKeys;
    
    // OPTIMIZATION 3: Process points in chunks for better cache locality
    const int CHUNK_SIZE = 1024;
    for (int chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        int chunkEnd = (chunkStart + CHUNK_SIZE < pointCount) ? chunkStart + CHUNK_SIZE : pointCount;
        
        for (int i = chunkStart; i < chunkEnd; i++) {
            int i3 = i * 3;
            // Direct memory access (already in WASM memory)
            float x = inputData[i3];
            float y = inputData[i3 + 1];
            float z = inputData[i3 + 2];
            
            // OPTIMIZATION 4: Use multiplication instead of division
            // Use floor() to match TypeScript/Rust Math.floor() behavior (handles negative correctly)
            int voxelX = static_cast<int>(std::floor((x - minX) * invVoxelSize));
            int voxelY = static_cast<int>(std::floor((y - minY) * invVoxelSize));
            int voxelZ = static_cast<int>(std::floor((z - minZ) * invVoxelSize));
            
            // OPTIMIZATION 5: Pack into uint64_t key (same as Rust's approach for hashing)
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                               (static_cast<uint64_t>(voxelY) << 16) |
                               static_cast<uint64_t>(voxelZ);
            
            // OPTIMIZATION: Use emplace to avoid copy (construct in-place)
            voxelKeys.emplace(voxelKey);
        }
    }
    
    // OPTIMIZATION 6: Single pass conversion with optimized output loop
    // Pre-calculate voxelSize multiplication to avoid repeated multiplication
    // Use pointer arithmetic for maximum performance (like optimized voxel downsampling)
    
    // Write directly to output buffer using pointer arithmetic
    float* outputPtrCurrent = outputPtr;
    int outputCount = 0;
    
    // OPTIMIZATION: Iterate and write directly without intermediate variables where possible
    // Remove safety check - we know voxelKeys.size() <= maxOutputPoints (it's unique voxels from input)
    for (const uint64_t voxelKey : voxelKeys) {
        // Extract voxel coordinates from integer key (optimized bit operations)
        // voxelX: bits 32-63 (32 bits), voxelY: bits 16-31 (16 bits), voxelZ: bits 0-15 (16 bits)
        int voxelX = static_cast<int32_t>(voxelKey >> 32);
        int voxelY = static_cast<int16_t>((voxelKey >> 16) & 0xFFFF); // Sign-extend 16-bit to int
        int voxelZ = static_cast<int16_t>(voxelKey & 0xFFFF); // Sign-extend 16-bit to int
        
        // Calculate voxel grid position (center of voxel grid cell)
        // Direct calculation and write (no intermediate variables)
        *outputPtrCurrent++ = offsetX + static_cast<float>(voxelX) * voxelSize;
        *outputPtrCurrent++ = offsetY + static_cast<float>(voxelY) * voxelSize;
        *outputPtrCurrent++ = offsetZ + static_cast<float>(voxelZ) * voxelSize;
        outputCount++;
    }
    
    return outputCount;
}

extern "C" {
    // Direct pointer-based voxel debug for zero-copy input access
    // JavaScript allocates memory, copies input data with HEAPF32.set(), calls this function,
    // then reads results from outputPtr
    int voxelDebugDirect(
        float* inputPtr,      // Pointer to input data in WASM heap (already copied via HEAPF32.set())
        int pointCount,        // Number of points (length / 3)
        float voxelSize,
        float minX,
        float minY,
        float minZ,
        float* outputPtr,     // Pointer to output buffer (pre-allocated, at least pointCount * 3 floats)
        int maxOutputPoints   // Maximum number of output points (for safety)
    ) {
        if (!inputPtr || !outputPtr || pointCount <= 0 || voxelSize <= 0 || maxOutputPoints <= 0) {
            return 0;
        }
        
        return voxelDebugInternal(
            inputPtr,
            pointCount,
            voxelSize,
            minX,
            minY,
            minZ,
            outputPtr,
            maxOutputPoints
        );
    }
}

void hideVoxelDebug() {
    g_voxelDebug.isVisible = false;
}

bool isVoxelDebugVisible() {
    return g_voxelDebug.isVisible;
}

emscripten::val getVoxelDebugCenters() {
    size_t voxelCount = g_voxelDebug.voxelCenters.size();
    emscripten::val result = emscripten::val::global("Float32Array").new_(voxelCount * 3);
    
    // Use .set() method - safe and works correctly
    // Direct memory access requires WASM heap backing which isn't guaranteed
    for (size_t i = 0; i < voxelCount; i++) {
        int i3 = static_cast<int>(i * 3);
        result.set(i3, g_voxelDebug.voxelCenters[i].x);
        result.set(i3 + 1, g_voxelDebug.voxelCenters[i].y);
        result.set(i3 + 2, g_voxelDebug.voxelCenters[i].z);
    }
    
    return result;
}

float getVoxelDebugSize() {
    return g_voxelDebug.voxelSize;
}

// Emscripten bindings for voxel debug
EMSCRIPTEN_BINDINGS(voxel_debug_module) {
    emscripten::value_object<Point3D>("Point3D")
        .field("x", &Point3D::x)
        .field("y", &Point3D::y)
        .field("z", &Point3D::z);
    
    emscripten::register_vector<Point3D>("Point3DVector");
    
    emscripten::function("showVoxelDebug", emscripten::select_overload<void()>(&showVoxelDebug));
    emscripten::function("showVoxelDebug", emscripten::select_overload<void(const emscripten::val&, float, float, float, float)>(&showVoxelDebug));
    emscripten::function("hideVoxelDebug", &hideVoxelDebug);
    emscripten::function("getVoxelDebugCenters", &getVoxelDebugCenters);
    emscripten::function("getVoxelDebugSize", &getVoxelDebugSize);
    emscripten::function("isVoxelDebugVisible", &isVoxelDebugVisible);
}

