#include <iostream>
#include <string>

int main() {
    std::string json = "{\"point_cloud_data\":[1.0,2.0,3.0],\"voxel_size\":2.0}";
    size_t pos = json.find("\"point_cloud_data\":[");
    std::cout << "Found at: " << pos << std::endl;
    if (pos != std::string::npos) {
        pos += 19;
        std::cout << "After +19: " << pos << " char: '" << json[pos] << "'" << std::endl;
        size_t arrayStart = pos;
        size_t arrayEnd = json.find(']', arrayStart);
        std::cout << "Array end at: " << arrayEnd << std::endl;
        if (arrayEnd != std::string::npos) {
            std::string content = json.substr(arrayStart, arrayEnd - arrayStart);
            std::cout << "Content: '" << content << "'" << std::endl;
        }
    }
}
