#!/bin/bash
# Build script for C++ point smoothing backend
# Uses clang++ with aggressive optimizations matching Rust

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_DIR="${TOOLS_DIR}/build"
cd "$SCRIPT_DIR"

# Create build directory if it doesn't exist
mkdir -p "$BUILD_DIR"

echo "Building C++ point smoothing backend with clang++..."

# Check if clang++ is installed
if ! command -v clang++ &> /dev/null; then
    echo "Error: clang++ not found. Please install it first:"
    echo "  sudo apt install clang"
    exit 1
fi

# Compile with clang++ using same optimization flags as Rust
# -O3: Maximum optimization (matches Rust opt-level = 3)
# -march=native: Optimize for current CPU architecture
# -ffast-math: Aggressive floating-point optimizations
# -flto: Link-time optimization (matches Rust lto = "fat")
# -std=c++17: C++17 standard
clang++ \
    -std=c++17 \
    -O3 \
    -march=native \
    -ffast-math \
    -flto \
    -o "${BUILD_DIR}/point_smooth_cpp" \
    point_smooth.cpp

echo "✅ C++ point smoothing backend built successfully with clang++!"
echo "Executable: ${BUILD_DIR}/point_smooth_cpp"
ls -lh "${BUILD_DIR}/point_smooth_cpp"


