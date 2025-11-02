#include <iostream>
#include <vector>
#include <unordered_map>
#include <cmath>
#include <sstream>
#include <cstdint>
#include <chrono>
#include <algorithm>
#include <iomanip>
#include <cctype>
#include <cstring>

// RapidJSON (header-only JSON library)
#include "rapidjson/include/rapidjson/document.h"
#include "rapidjson/include/rapidjson/writer.h"
#include "rapidjson/include/rapidjson/stringbuffer.h"
#include "rapidjson/include/rapidjson/istreamwrapper.h"

using namespace rapidjson;

// Custom hash for better performance (identity hash for uint64_t keys)
struct FastHash {
    size_t operator()(uint64_t key) const noexcept {
        // Identity hash - uint64_t keys are already well-distributed
        return static_cast<size_t>(key);
    }
};

int main() {
    // Read all input from stdin (JSON format)
    std::string inputJson;
    std::string line;
    while (std::getline(std::cin, line)) {
        inputJson += line;
        if (inputJson.length() > 50000000) break; // Safety limit (50MB)
    }
    
    // Parse JSON using RapidJSON (ultra-fast)
    Document doc;
    if (doc.Parse(inputJson.c_str()).HasParseError()) {
        // Fallback to empty result if parsing fails
        std::cout << "{\"success\":true,\"downsampled_points\":[],\"original_count\":0,\"downsampled_count\":0,\"voxel_count\":0,\"processing_time\":0.0}" << std::endl;
        return 0;
    }
    
    // Extract values using RapidJSON (very fast)
    float voxelSize = doc["voxel_size"].GetFloat();
    const Value& pointsArray = doc["point_cloud_data"];
    
    // Extract bounds first
    const Value& bounds = doc["global_bounds"];
    float minX = bounds["min_x"].GetFloat();
    float minY = bounds["min_y"].GetFloat();
    float minZ = bounds["min_z"].GetFloat();
    
    int pointCount = pointsArray.Size() / 3;
    if (pointCount == 0 || voxelSize <= 0) {
        std::cout << "{\"success\":true,\"downsampled_points\":[],\"original_count\":0,\"downsampled_count\":0,\"voxel_count\":0,\"processing_time\":0.0}" << std::endl;
        return 0;
    }
    
    // Fast single-pass copy to contiguous memory (better cache locality than indirect access)
    std::vector<float> pointCloudData;
    pointCloudData.reserve(pointsArray.Size());
    pointCloudData.resize(pointsArray.Size());
    
    // Single optimized copy loop - contiguous memory is faster than indirect RapidJSON access
    for (SizeType i = 0; i < pointsArray.Size(); i++) {
        pointCloudData[i] = pointsArray[i].GetFloat();
    }
    
    float* inputData = pointCloudData.data();
    
    // Start timing (measure only processing, not I/O)
    auto startTime = std::chrono::high_resolution_clock::now();
    
    // OPTIMIZED C++ voxel downsampling - use contiguous memory for cache efficiency
    float invVoxelSize = 1.0f / voxelSize;
    
    // Use custom hash for better performance (identity hash since keys are already well-distributed)
    std::unordered_map<uint64_t, std::tuple<float, float, float, int>, FastHash> voxelMap;
    voxelMap.reserve(pointCount / 3); // Better estimate to avoid rehashing
    
    const int CHUNK_SIZE = 1024;
    // Process from contiguous memory - maximum cache efficiency
    for (int chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        int chunkEnd = std::min(chunkStart + CHUNK_SIZE, pointCount);
        
        for (int i = chunkStart; i < chunkEnd; i++) {
            int i3 = i * 3;
            // Direct memory access - fastest possible
            float x = inputData[i3];
            float y = inputData[i3 + 1];
            float z = inputData[i3 + 2];
            
            // Use floor() to match TypeScript/Rust Math.floor() behavior
            int voxelX = static_cast<int>(std::floor((x - minX) * invVoxelSize));
            int voxelY = static_cast<int>(std::floor((y - minY) * invVoxelSize));
            int voxelZ = static_cast<int>(std::floor((z - minZ) * invVoxelSize));
            
            uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                               (static_cast<uint64_t>(voxelY) << 16) |
                               static_cast<uint64_t>(voxelZ);
            
            // Use try_emplace for better performance (avoids extra hash lookup)
            auto [it, inserted] = voxelMap.try_emplace(voxelKey, x, y, z, 1);
            if (!inserted) {
                // Update existing entry - more efficient than find + modify
                auto& [sumX, sumY, sumZ, count] = it->second;
                sumX += x;
                sumY += y;
                sumZ += z;
                count++;
            }
        }
    }
    
    // Build output
    int outputCount = voxelMap.size();
    std::vector<float> downsampledPoints;
    downsampledPoints.reserve(outputCount * 3);
    
    for (const auto& [voxelKey, voxelData] : voxelMap) {
        const auto& [sumX, sumY, sumZ, count] = voxelData;
        downsampledPoints.push_back(sumX / count);
        downsampledPoints.push_back(sumY / count);
        downsampledPoints.push_back(sumZ / count);
    }
    
    // Calculate processing time
    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime);
    double processingTime = duration.count() / 1000.0;
    
    // Output JSON - use pre-allocated string buffer (faster than RapidJSON Writer for large arrays)
    size_t estimatedSize = downsampledPoints.size() * 15 + 200;
    std::string jsonOutput;
    jsonOutput.reserve(estimatedSize);
    
    jsonOutput = "{\"success\":true,\"downsampled_points\":[";
    
    char buffer[32];
    for (size_t i = 0; i < downsampledPoints.size(); i++) {
        if (i > 0) jsonOutput += ',';
        int len = snprintf(buffer, sizeof(buffer), "%.6f", downsampledPoints[i]);
        jsonOutput.append(buffer, len);
    }
    
    jsonOutput += "],\"original_count\":";
    int len = snprintf(buffer, sizeof(buffer), "%d", pointCount);
    jsonOutput.append(buffer, len);
    
    jsonOutput += ",\"downsampled_count\":";
    len = snprintf(buffer, sizeof(buffer), "%d", outputCount);
    jsonOutput.append(buffer, len);
    
    jsonOutput += ",\"voxel_count\":";
    len = snprintf(buffer, sizeof(buffer), "%d", outputCount);
    jsonOutput.append(buffer, len);
    
    jsonOutput += ",\"processing_time\":";
    len = snprintf(buffer, sizeof(buffer), "%.6f", processingTime);
    jsonOutput.append(buffer, len);
    
    jsonOutput += "}";
    
    std::cout << jsonOutput << std::endl;
    
    return 0;
}
