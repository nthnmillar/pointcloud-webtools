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
    
    // Calculate downsampled points (voxel centers)
    std::vector<float> downsampledPoints;
    for (const auto& pair : voxelMap) {
        const Voxel& voxel = pair.second;
        // Calculate average position (voxel center)
        float avgX = voxel.sumX / voxel.count;
        float avgY = voxel.sumY / voxel.count;
        float avgZ = voxel.sumZ / voxel.count;
        
        downsampledPoints.push_back(avgX);
        downsampledPoints.push_back(avgY);
        downsampledPoints.push_back(avgZ);
    }
    
    // Output results
    std::cout << voxelMap.size() << std::endl; // voxel count
    std::cout << pointCount << std::endl; // original count
    std::cout << downsampledPoints.size() / 3 << std::endl; // downsampled count
    for (float point : downsampledPoints) {
        std::cout << point << " ";
    }
    std::cout << std::endl;
    
    return 0;
}
