#include <iostream>
#include <vector>
#include <cmath>
#include <sstream>

struct Point3D {
    float x, y, z;
    Point3D(float x = 0, float y = 0, float z = 0) : x(x), y(y), z(z) {}
    
    float distance(const Point3D& other) const {
        float dx = x - other.x;
        float dy = y - other.y;
        float dz = z - other.z;
        return std::sqrt(dx*dx + dy*dy + dz*dz);
    }
};

int main() {
    std::string line;
    std::getline(std::cin, line);
    
    // Parse input: pointCount smoothingRadius iterations
    std::istringstream iss(line);
    int pointCount;
    float smoothingRadius;
    int iterations;
    iss >> pointCount >> smoothingRadius >> iterations;
    
    // Read point cloud data
    std::vector<Point3D> points;
    for (int i = 0; i < pointCount; i++) {
        float x, y, z;
        std::cin >> x >> y >> z;
        points.push_back(Point3D(x, y, z));
    }
    
    // C++ point cloud smoothing algorithm
    std::vector<Point3D> smoothedPoints = points;
    
    for (int iter = 0; iter < iterations; iter++) {
        std::vector<Point3D> tempPoints = smoothedPoints;
        
        for (int i = 0; i < pointCount; i++) {
            float x = smoothedPoints[i].x;
            float y = smoothedPoints[i].y;
            float z = smoothedPoints[i].z;
            
            float sumX = 0, sumY = 0, sumZ = 0;
            int count = 0;
            
            // Find neighbors within smoothing radius
            for (int j = 0; j < pointCount; j++) {
                if (i == j) continue;
                
                float dist = smoothedPoints[i].distance(smoothedPoints[j]);
                if (dist <= smoothingRadius) {
                    sumX += smoothedPoints[j].x;
                    sumY += smoothedPoints[j].y;
                    sumZ += smoothedPoints[j].z;
                    count++;
                }
            }
            
            // Apply smoothing if neighbors found
            if (count > 0) {
                tempPoints[i].x = (x + sumX) / (count + 1);
                tempPoints[i].y = (y + sumY) / (count + 1);
                tempPoints[i].z = (z + sumZ) / (count + 1);
            }
        }
        
        smoothedPoints = tempPoints;
    }
    
    // Output results
    std::cout << pointCount << std::endl; // point count
    for (const auto& point : smoothedPoints) {
        std::cout << point.x << " " << point.y << " " << point.z << " ";
    }
    std::cout << std::endl;
    
    return 0;
}
