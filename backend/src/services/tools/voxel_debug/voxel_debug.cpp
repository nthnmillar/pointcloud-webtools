#include <iostream>
#include <vector>
#include <unordered_set>
#include <cmath>
#include <sstream>
#include <cstdint>

struct Point3D {
    float x, y, z;
    Point3D(float x = 0, float y = 0, float z = 0) : x(x), y(y), z(z) {}
};

int main() {
    std::string line;
    std::getline(std::cin, line);
    
    // Parse input: pointCount voxelSize minX minY minZ maxX maxY maxZ
    std::istringstream iss(line);
    int pointCount;
    float voxelSize, minX, minY, minZ, maxX, maxY, maxZ;
    iss >> pointCount >> voxelSize >> minX >> minY >> minZ >> maxX >> maxY >> maxZ;
    
    // Read point cloud data
    std::vector<Point3D> points;
    for (int i = 0; i < pointCount; i++) {
        float x, y, z;
        std::cin >> x >> y >> z;
        points.push_back(Point3D(x, y, z));
    }
    
    // ULTRA OPTIMIZED C++ voxel debug algorithm - matches WASM version
    // OPTIMIZATION 1: Pre-calculate inverse voxel size to avoid division
    float invVoxelSize = 1.0f / voxelSize;
    
    // OPTIMIZATION 2: Use unordered_set for unique voxel coordinates (same as WASM)
    std::unordered_set<uint64_t> voxelKeys;
    voxelKeys.reserve(pointCount / 4); // Reserve space to avoid rehashing
    
    // OPTIMIZATION 3: Process points in chunks for better cache locality
    const int CHUNK_SIZE = 1024;
    for (int chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        int chunkEnd = std::min(chunkStart + CHUNK_SIZE, pointCount);
        
        for (int i = chunkStart; i < chunkEnd; i++) {
            const Point3D& point = points[i];
            
            // OPTIMIZATION 4: Use multiplication instead of division
            int voxelX = static_cast<int>((point.x - minX) * invVoxelSize);
            int voxelY = static_cast<int>((point.y - minY) * invVoxelSize);
            int voxelZ = static_cast<int>((point.z - minZ) * invVoxelSize);
            
            // OPTIMIZATION 5: Create integer hash key (same as WASM)
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                               (static_cast<uint64_t>(voxelY) << 16) |
                               static_cast<uint64_t>(voxelZ);
            
            // OPTIMIZATION 6: Store unique voxel keys only (same as WASM)
            voxelKeys.insert(voxelKey);
        }
    }
    
    // OPTIMIZATION 7: Pre-allocate result vector
    std::vector<float> voxelGridPositions;
    voxelGridPositions.reserve(voxelKeys.size() * 3);
    
    // OPTIMIZATION 8: Pre-calculate offsets for grid position calculation
    float halfVoxelSize = voxelSize * 0.5f;
    float offsetX = minX + halfVoxelSize;
    float offsetY = minY + halfVoxelSize;
    float offsetZ = minZ + halfVoxelSize;
    
    // OPTIMIZATION 9: Single pass conversion with direct grid position calculation
    for (const uint64_t voxelKey : voxelKeys) {
        // Extract voxel coordinates from integer key (same as WASM)
        int voxelX = static_cast<int>(voxelKey >> 32);
        int voxelY = static_cast<int>((voxelKey >> 16) & 0xFFFF);
        int voxelZ = static_cast<int>(voxelKey & 0xFFFF);
        
        // Calculate voxel grid position (center of voxel grid cell) - same as WASM
        float gridX = offsetX + voxelX * voxelSize;
        float gridY = offsetY + voxelY * voxelSize;
        float gridZ = offsetZ + voxelZ * voxelSize;
        
        voxelGridPositions.push_back(gridX);
        voxelGridPositions.push_back(gridY);
        voxelGridPositions.push_back(gridZ);
    }
    
    // Output results
    std::cout << voxelKeys.size() << std::endl; // voxel count
    for (float pos : voxelGridPositions) {
        std::cout << pos << " ";
    }
    std::cout << std::endl;
    
    return 0;
}
