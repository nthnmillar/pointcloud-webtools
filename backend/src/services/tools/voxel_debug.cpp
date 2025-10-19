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
    
    // Read point cloud data
    std::vector<Point3D> points;
    for (int i = 0; i < pointCount; i++) {
        float x, y, z;
        std::cin >> x >> y >> z;
        points.push_back(Point3D(x, y, z));
    }
    
    // Optimized C++ voxel downsampling algorithm using integer hashing
    std::unordered_map<uint64_t, Voxel> voxelMap;
    
    for (const auto& point : points) {
        // Calculate voxel coordinates
        int voxelX = static_cast<int>((point.x - minX) / voxelSize);
        int voxelY = static_cast<int>((point.y - minY) / voxelSize);
        int voxelZ = static_cast<int>((point.z - minZ) / voxelSize);
        
        // Create integer hash key - much faster than string concatenation
        uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                           (static_cast<uint64_t>(voxelY) << 16) |
                           static_cast<uint64_t>(voxelZ);
        
        // Direct access with [] operator - much faster than find()
        Voxel& voxel = voxelMap[voxelKey];
        voxel.count++;
        voxel.sumX += point.x;
        voxel.sumY += point.y;
        voxel.sumZ += point.z;
    }
    
    // Calculate voxel grid positions for visualization - optimized
    std::vector<float> voxelGridPositions;
    voxelGridPositions.reserve(voxelMap.size() * 3); // Pre-allocate memory
    
    for (const auto& [voxelKey, voxel] : voxelMap) {
        // Extract voxel coordinates from integer key
        int voxelX = static_cast<int>(voxelKey >> 32);
        int voxelY = static_cast<int>((voxelKey >> 16) & 0xFFFF);
        int voxelZ = static_cast<int>(voxelKey & 0xFFFF);
        
        // Calculate voxel grid position (center of voxel grid cell)
        float gridX = minX + (voxelX + 0.5f) * voxelSize;
        float gridY = minY + (voxelY + 0.5f) * voxelSize;
        float gridZ = minZ + (voxelZ + 0.5f) * voxelSize;
        
        voxelGridPositions.push_back(gridX);
        voxelGridPositions.push_back(gridY);
        voxelGridPositions.push_back(gridZ);
    }
    
    // Output results
    std::cout << voxelMap.size() << std::endl; // voxel count
    for (float pos : voxelGridPositions) {
        std::cout << pos << " ";
    }
    std::cout << std::endl;
    
    return 0;
}
