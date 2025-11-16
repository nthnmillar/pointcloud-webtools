#!/bin/bash
# Build script for Cython extension

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building Cython extension for point cloud smoothing..."

# Check if Cython is installed
if ! python3 -c "import Cython" 2>/dev/null; then
    echo "Cython not found. Please install it first:"
    echo "  Option 1: sudo apt install python3-cython"
    echo "  Option 2: pip3 install --user Cython"
    echo "  Option 3: pip3 install --break-system-packages Cython"
    exit 1
fi

# Compile Cython extension
echo "Compiling Cython extension..."
python3 setup_cython.py build_ext --inplace

echo "Cython extension built successfully!"
echo "Generated files:"
ls -lh point_smooth_cython*.so 2>/dev/null || ls -lh point_smooth_cython*.pyd 2>/dev/null || echo "Extension file not found (check build output)"

