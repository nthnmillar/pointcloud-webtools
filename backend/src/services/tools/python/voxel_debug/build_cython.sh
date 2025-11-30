#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_DIR="${TOOLS_DIR}/build"
cd "$SCRIPT_DIR"

# Create build directory if it doesn't exist
mkdir -p "$BUILD_DIR"

echo "Building Cython extension for voxel debug..."
if ! python3 -c "import Cython" 2>/dev/null; then
    echo "Cython not found. Please install it first:"
    echo "  Option 1: sudo apt install python3-cython"
    echo "  Option 2: pip3 install --user Cython"
    echo "  Option 3: pip3 install --break-system-packages Cython"
    exit 1
fi
echo "Compiling Cython extension..."
python3 setup_cython.py build_ext --inplace
echo "Cython extension built successfully!"

# Move compiled .so file to build directory
if [ -f "voxel_debug_cython.cpython-"*.so ]; then
    mv voxel_debug_cython.cpython-*.so "$BUILD_DIR/"
    echo "✅ Moved compiled extension to: ${BUILD_DIR}/"
fi

