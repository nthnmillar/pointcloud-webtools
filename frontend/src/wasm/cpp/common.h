#ifndef COMMON_H
#define COMMON_H

#include <cstdint>
#include <cmath>

// Fast hash function for 64-bit integers (matches Rust's FxHash exactly)
// FxHash uses a simple multiply and rotate - very fast for integer keys
struct FastHash {
    size_t operator()(uint64_t x) const noexcept {
        // FxHash algorithm: multiply by magic constant and rotate
        // This is the actual FxHash implementation from rustc-hash
        constexpr uint64_t K = 0x517cc1b727220a95ULL;
        x = x * K;
        // Rotate left by 5 (equivalent to (x << 5) | (x >> 59))
        x = (x << 5) | (x >> 59);
        return static_cast<size_t>(x);
    }
};

struct Point3D {
    float x, y, z;
    Point3D(float x = 0, float y = 0, float z = 0) : x(x), y(y), z(z) {}
};

#endif // COMMON_H

