#!/bin/bash
# Build script - builds native binaries and optionally frontend
# Usage: ./build.sh [--frontend] to also build frontend

set -e

# Get the directory where this script is located (project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RUST_SRC_DIR="backend/src/services/tools/rust"
CPP_DIR="backend/src/services/tools/cpp"
PYTHON_DIR="backend/src/services/tools/python"
BUILD_DIR="backend/src/services/tools/build"

# Build Rust binaries
RUST_BINARY="$BUILD_DIR/voxel_downsample_rust"
NEED_REBUILD_RUST=false

if [ ! -f "$RUST_BINARY" ] && [ ! -f "$BUILD_DIR/voxel_downsample" ]; then
    NEED_REBUILD_RUST=true
    echo "📦 Building Rust binaries..."
elif [ -f "$RUST_BINARY" ]; then
    if find "$RUST_SRC_DIR/src" -name "*.rs" -newer "$RUST_BINARY" 2>/dev/null | grep -q .; then
        NEED_REBUILD_RUST=true
        echo "📦 Rust source changed, rebuilding..."
    fi
fi

if [ "$NEED_REBUILD_RUST" = true ]; then
    cd "$RUST_SRC_DIR"
    if ! cargo build --release; then
        echo "❌ Rust binaries failed to build"
        exit 1
    fi
    mkdir -p ../build
    
    # Copy each binary explicitly
    if [ -f "target/release/voxel_downsample_rust" ]; then
        cp target/release/voxel_downsample_rust ../build/
    else
        echo "❌ voxel_downsample_rust binary not found in target/release/"
        exit 1
    fi
    
    if [ -f "target/release/voxel_debug_rust" ]; then
        cp target/release/voxel_debug_rust ../build/
    else
        echo "❌ voxel_debug_rust binary not found in target/release/"
        exit 1
    fi
    
    if [ -f "target/release/point_smooth_rust" ]; then
        cp target/release/point_smooth_rust ../build/
    else
        echo "❌ point_smooth_rust binary not found in target/release/"
        exit 1
    fi
    
    # Verify binaries were created in build directory
    cd "$SCRIPT_DIR"
    if [ ! -f "$BUILD_DIR/voxel_downsample_rust" ] || [ ! -f "$BUILD_DIR/voxel_debug_rust" ] || [ ! -f "$BUILD_DIR/point_smooth_rust" ]; then
        echo "❌ Rust binaries were not copied to $BUILD_DIR"
        echo "   Looking for: $BUILD_DIR/voxel_downsample_rust"
        echo "   Looking for: $BUILD_DIR/voxel_debug_rust"
        echo "   Looking for: $BUILD_DIR/point_smooth_rust"
        ls -la "$BUILD_DIR/" || echo "   Build directory doesn't exist"
        exit 1
    fi
    echo "✅ Rust binaries built and copied"
fi

# Build C++ binaries
if command -v clang++ &> /dev/null; then
    CPP_BINARY="$BUILD_DIR/voxel_downsample"
    NEED_REBUILD_CPP=false
    
    if [ ! -f "$CPP_BINARY" ]; then
        NEED_REBUILD_CPP=true
        echo "📦 Building C++ binaries..."
    elif [ -f "$CPP_BINARY" ]; then
        if find "$CPP_DIR" -name "*.cpp" -newer "$CPP_BINARY" 2>/dev/null | grep -q .; then
            NEED_REBUILD_CPP=true
            echo "📦 C++ source changed, rebuilding..."
        fi
    fi
    
    if [ "$NEED_REBUILD_CPP" = true ]; then
        cd "$CPP_DIR/voxel_downsample"
        chmod +x build_cpp.sh 2>/dev/null || true
        if ! ./build_cpp.sh; then
            echo "❌ Failed to build C++ voxel_downsample"
            exit 1
        fi
        if [ ! -f "$SCRIPT_DIR/$BUILD_DIR/voxel_downsample" ]; then
            echo "❌ C++ binary voxel_downsample was not created at $SCRIPT_DIR/$BUILD_DIR/voxel_downsample"
            exit 1
        fi
        
        cd ../voxel_debug
        chmod +x build_cpp.sh 2>/dev/null || true
        if ! ./build_cpp.sh; then
            echo "❌ Failed to build C++ voxel_debug"
            exit 1
        fi
        if [ ! -f "$SCRIPT_DIR/$BUILD_DIR/voxel_debug" ]; then
            echo "❌ C++ binary voxel_debug was not created at $SCRIPT_DIR/$BUILD_DIR/voxel_debug"
            exit 1
        fi
        
        cd ../point_smooth
        chmod +x build_cpp.sh 2>/dev/null || true
        if ! ./build_cpp.sh; then
            echo "❌ Failed to build C++ point_smooth"
            exit 1
        fi
        if [ ! -f "$SCRIPT_DIR/$BUILD_DIR/point_smooth_cpp" ]; then
            echo "❌ C++ binary point_smooth_cpp was not created at $SCRIPT_DIR/$BUILD_DIR/point_smooth_cpp"
            exit 1
        fi
        
        cd ../../../../..
    fi
else
    echo "❌ clang++ not found - C++ binaries are required"
    exit 1
fi

# Build Cython extensions
if python3 -c "import Cython" 2>/dev/null; then
    for module in voxel_downsample voxel_debug point_smooth; do
        CYTHON_SRC="$PYTHON_DIR/$module/${module}_cython.pyx"
        NEED_REBUILD_CYTHON=false
        
        CYTHON_SO=$(ls "$BUILD_DIR/${module}_cython.cpython-"*.so 2>/dev/null | head -1)
        
        if [ -z "$CYTHON_SO" ]; then
            NEED_REBUILD_CYTHON=true
            echo "📦 Building Cython ${module}..."
        elif [ -f "$CYTHON_SRC" ] && [ "$CYTHON_SRC" -nt "$CYTHON_SO" ]; then
            NEED_REBUILD_CYTHON=true
            echo "📦 Cython ${module} source changed, rebuilding..."
        fi
        
        if [ "$NEED_REBUILD_CYTHON" = true ]; then
            cd "$PYTHON_DIR/$module"
            chmod +x build_cython.sh 2>/dev/null || true
            ./build_cython.sh 2>/dev/null || echo "⚠️  Cython ${module} skipped"
            cd ../../../../..
        fi
    done
else
    echo "⚠️  Cython not found, skipping Cython builds"
fi

# Build frontend if --frontend flag is passed
if [ "$1" = "--frontend" ]; then
    echo "📦 Building frontend..."
    cd frontend
    yarn build
    cd ..
fi

echo "✅ Build complete!"

