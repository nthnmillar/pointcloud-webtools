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
    
    // Ultra-optimized voxel downsampling using direct memory access (same as WASM)
    std::unordered_map<uint64_t, Voxel> voxelMap;
    
    // Process each point directly from memory - same algorithm as WASM
    for (int i = 0; i < pointCount; i++) {
        int i3 = i * 3;
        float x = inputData[i3];
        float y = inputData[i3 + 1];
        float z = inputData[i3 + 2];
        
        // Calculate voxel coordinates
        int voxelX = static_cast<int>((x - minX) / voxelSize);
        int voxelY = static_cast<int>((y - minY) / voxelSize);
        int voxelZ = static_cast<int>((z - minZ) / voxelSize);
        
        // Create integer hash key - much faster than string concatenation
        uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                           (static_cast<uint64_t>(voxelY) << 16) |
                           static_cast<uint64_t>(voxelZ);
        
        // Direct access with [] operator - much faster than find()
        Voxel& voxel = voxelMap[voxelKey];
        voxel.count++;
        voxel.sumX += x;
        voxel.sumY += y;
        voxel.sumZ += z;
    }
    
    // Calculate downsampled points using direct memory access (same as WASM)
    int outputCount = voxelMap.size();
    float* outputData = (float*)malloc(outputCount * 3 * sizeof(float));
    
    int outputIndex = 0;
    for (const auto& [voxelKey, voxel] : voxelMap) {
        // Calculate average position (voxel center) - direct memory write
        outputData[outputIndex * 3] = voxel.sumX / voxel.count;
        outputData[outputIndex * 3 + 1] = voxel.sumY / voxel.count;
        outputData[outputIndex * 3 + 2] = voxel.sumZ / voxel.count;
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
