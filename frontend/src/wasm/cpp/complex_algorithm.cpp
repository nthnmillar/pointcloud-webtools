#include <vector>
#include <cmath>
#include <algorithm>
#include <emscripten/bind.h>
#include <emscripten/val.h>

// Complex geometric algorithm that would be slow in JavaScript
// This simulates the kind of heavy computation Figma does
emscripten::val complexPointProcessing(
    const emscripten::val& inputPoints, 
    float complexity = 1.0f
) {
    if (inputPoints.isNull() || inputPoints.isUndefined()) {
        return emscripten::val::global("Float32Array").new_();
    }
    
    int length = inputPoints["length"].as<int>();
    if (length % 3 != 0 || length == 0) {
        return emscripten::val::global("Float32Array").new_();
    }
    
    float* data = reinterpret_cast<float*>(inputPoints["byteOffset"].as<int>());
    int pointCount = length / 3;
    
    // Create result array
    emscripten::val resultArray = emscripten::val::global("Float32Array").new_(length);
    float* resultData = reinterpret_cast<float*>(resultArray["byteOffset"].as<int>());
    
    // Complex algorithm: Multi-pass processing with heavy math
    for (int pass = 0; pass < 10; pass++) {
        for (int i = 0; i < pointCount; i++) {
            float x = data[i * 3];
            float y = data[i * 3 + 1];
            float z = data[i * 3 + 2];
            
            // Heavy mathematical operations
            float distance = sqrt(x*x + y*y + z*z);
            float angle = atan2(y, x);
            float elevation = asin(z / distance);
            
            // Complex transformations
            float newX = x * cos(angle * complexity) - y * sin(angle * complexity);
            float newY = x * sin(angle * complexity) + y * cos(angle * complexity);
            float newZ = z * cos(elevation * complexity) + distance * sin(elevation * complexity);
            
            // Apply noise and filtering
            float noise = sin(x * 0.1) * cos(y * 0.1) * sin(z * 0.1);
            newX += noise * 0.1 * complexity;
            newY += noise * 0.1 * complexity;
            newZ += noise * 0.1 * complexity;
            
            // Store result
            resultData[i * 3] = newX;
            resultData[i * 3 + 1] = newY;
            resultData[i * 3 + 2] = newZ;
        }
        
        // Copy result back to input for next pass
        for (int i = 0; i < length; i++) {
            data[i] = resultData[i];
        }
    }
    
    return resultArray;
}

// Simple voxel downsampling (what we had before)
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
    if (length % 3 != 0 || length == 0) {
        return emscripten::val::global("Float32Array").new_();
    }
    
    float* data = reinterpret_cast<float*>(inputPoints["byteOffset"].as<int>());
    
    const int MAX_VOXELS = 1000000;
    float* voxelSums = new float[MAX_VOXELS * 4];
    int* voxelKeys = new int[MAX_VOXELS * 3];
    int voxelCount = 0;
    
    int pointCount = length / 3;
    
    for (int i = 0; i < pointCount; i++) {
        float x = data[i * 3];
        float y = data[i * 3 + 1];
        float z = data[i * 3 + 2];
        
        int voxelX = (int)((x - globalMinX) / voxelSize);
        int voxelY = (int)((y - globalMinY) / voxelSize);
        int voxelZ = (int)((z - globalMinZ) / voxelSize);
        
        int voxelIndex = -1;
        for (int j = 0; j < voxelCount; j++) {
            if (voxelKeys[j * 3] == voxelX && 
                voxelKeys[j * 3 + 1] == voxelY && 
                voxelKeys[j * 3 + 2] == voxelZ) {
                voxelIndex = j;
                break;
            }
        }
        
        if (voxelIndex == -1) {
            if (voxelCount < MAX_VOXELS) {
                voxelIndex = voxelCount++;
                voxelKeys[voxelIndex * 3] = voxelX;
                voxelKeys[voxelIndex * 3 + 1] = voxelY;
                voxelKeys[voxelIndex * 3 + 2] = voxelZ;
                voxelSums[voxelIndex * 4] = 0;
                voxelSums[voxelIndex * 4 + 1] = 0;
                voxelSums[voxelIndex * 4 + 2] = 0;
                voxelSums[voxelIndex * 4 + 3] = 0;
            }
        }
        
        if (voxelIndex != -1) {
            voxelSums[voxelIndex * 4] += x;
            voxelSums[voxelIndex * 4 + 1] += y;
            voxelSums[voxelIndex * 4 + 2] += z;
            voxelSums[voxelIndex * 4 + 3] += 1;
        }
    }
    
    emscripten::val resultArray = emscripten::val::global("Float32Array").new_(voxelCount * 3);
    float* resultData = reinterpret_cast<float*>(resultArray["byteOffset"].as<int>());
    
    for (int i = 0; i < voxelCount; i++) {
        float count = voxelSums[i * 4 + 3];
        if (count > 0) {
            resultData[i * 3] = voxelSums[i * 4] / count;
            resultData[i * 3 + 1] = voxelSums[i * 4 + 1] / count;
            resultData[i * 3 + 2] = voxelSums[i * 4 + 2] / count;
        }
    }
    
    delete[] voxelSums;
    delete[] voxelKeys;
    
    return resultArray;
}

EMSCRIPTEN_BINDINGS(complex_module) {
    emscripten::function("complexPointProcessing", &complexPointProcessing);
    emscripten::function("voxelDownsample", &voxelDownsample);
}

