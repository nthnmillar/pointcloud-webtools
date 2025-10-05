#include <iostream>
#include <vector>
#include <unordered_map>
#include <cmath>
#include <sstream>

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
    
    // C++ voxel downsampling algorithm
    std::unordered_map<std::string, Voxel> voxelMap;
    
    for (const auto& point : points) {
        // Calculate voxel coordinates
        int voxelX = std::floor((point.x - minX) / voxelSize);
        int voxelY = std::floor((point.y - minY) / voxelSize);
        int voxelZ = std::floor((point.z - minZ) / voxelSize);
        
        std::string voxelKey = std::to_string(voxelX) + "," + 
                              std::to_string(voxelY) + "," + 
                              std::to_string(voxelZ);
        
        if (voxelMap.find(voxelKey) != voxelMap.end()) {
            Voxel& voxel = voxelMap[voxelKey];
            voxel.count++;
            voxel.sumX += point.x;
            voxel.sumY += point.y;
            voxel.sumZ += point.z;
        } else {
            Voxel voxel;
            voxel.count = 1;
            voxel.sumX = point.x;
            voxel.sumY = point.y;
            voxel.sumZ = point.z;
            voxelMap[voxelKey] = voxel;
        }
    }
    
    // Calculate voxel grid positions for visualization
    std::vector<float> voxelGridPositions;
    for (const auto& pair : voxelMap) {
        std::string voxelKey = pair.first;
        size_t pos1 = voxelKey.find(',');
        size_t pos2 = voxelKey.find(',', pos1 + 1);
        
        int voxelX = std::stoi(voxelKey.substr(0, pos1));
        int voxelY = std::stoi(voxelKey.substr(pos1 + 1, pos2 - pos1 - 1));
        int voxelZ = std::stoi(voxelKey.substr(pos2 + 1));
        
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
