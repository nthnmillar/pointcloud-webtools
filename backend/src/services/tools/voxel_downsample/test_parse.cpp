#include <iostream>
#include <string>
#include <sstream>
#include <vector>

int main() {
    std::string json = "{\"point_cloud_data\":[1.0,2.0,3.0,4.0,5.0,6.0],\"voxel_size\":2.0}";
    size_t pos = json.find("\"point_cloud_data\":[");
    if (pos != std::string::npos) {
        pos += 19;
        size_t arrayStart = pos;
        size_t depth = 1;
        size_t arrayEnd = arrayStart;
        
        for (size_t i = arrayStart; i < json.length() && depth > 0; i++) {
            if (json[i] == '[') depth++;
            else if (json[i] == ']') {
                depth--;
                if (depth == 0) {
                    arrayEnd = i;
                    break;
                }
            }
        }
        
        std::string arrayContent = json.substr(arrayStart, arrayEnd - arrayStart);
        std::cout << "Array content: '" << arrayContent << "'" << std::endl;
        
        std::istringstream iss(arrayContent);
        std::string token;
        std::vector<float> data;
        
        while (std::getline(iss, token, ',')) {
            token.erase(0, token.find_first_not_of(" \t\n\r"));
            token.erase(token.find_last_not_of(" \t\n\r") + 1);
            if (!token.empty()) {
                std::cout << "Token: '" << token << "' -> " << std::stof(token) << std::endl;
                data.push_back(std::stof(token));
            }
        }
        std::cout << "Total: " << data.size() << std::endl;
    }
}
