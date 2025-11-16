#!/bin/bash
# Build script for C++ voxel downsampling backend
# Uses clang++ with aggressive optimizations matching Cython

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building C++ voxel downsampling backend with clang++..."

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
# -stdlib=libc++: Use libc++ (LLVM's standard library) to match Emscripten!
# This should make C++ BE performance match C++ WASM performance
clang++ \
    -std=c++17 \
    -stdlib=libc++ \
    -O3 \
    -march=native \
    -ffast-math \
    -flto \
    -I"${SCRIPT_DIR}/include" \
    -o voxel_downsample \
    voxel_downsample.cpp

echo "✅ C++ backend built successfully with clang++!"
echo "Executable: $(pwd)/voxel_downsample"
ls -lh voxel_downsample

