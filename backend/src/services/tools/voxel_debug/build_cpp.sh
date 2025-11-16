#!/bin/bash
# Build script for C++ voxel debug backend
# Uses clang++ with aggressive optimizations matching Cython

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building C++ voxel debug backend with clang++..."

# Check if clang++ is installed
if ! command -v clang++ &> /dev/null; then
    echo "Error: clang++ not found. Please install it first:"
    echo "  sudo apt install clang"
    exit 1
fi

# Compile with clang++ using same optimization flags as Cython
# -O3: Maximum optimization
# -march=native: Optimize for current CPU architecture
# -ffast-math: Aggressive floating-point optimizations
# -flto: Link-time optimization
# -std=c++17: C++17 standard
clang++ \
    -std=c++17 \
    -O3 \
    -march=native \
    -ffast-math \
    -flto \
    -I"${SCRIPT_DIR}/../voxel_downsample/include" \
    -o voxel_debug \
    voxel_debug.cpp

echo "✅ C++ voxel debug backend built successfully with clang++!"
echo "Executable: $(pwd)/voxel_debug"
ls -lh voxel_debug

