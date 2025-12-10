#!/bin/bash
# Build script - builds native binaries and optionally frontend
# Usage: ./build.sh [--frontend] to also build frontend

set -e

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
    if cargo build --release 2>/dev/null; then
        mkdir -p ../build
        cp target/release/*_rust ../build/ 2>/dev/null || true
        echo "✅ Rust binaries built"
    else
        echo "❌ Rust binaries failed to build"
    fi
    cd ../../../../..
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
        ./build_cpp.sh 2>/dev/null || echo "⚠️  C++ voxel_downsample skipped"
        
        cd ../voxel_debug
        chmod +x build_cpp.sh 2>/dev/null || true
        ./build_cpp.sh 2>/dev/null || echo "⚠️  C++ voxel_debug skipped"
        
        cd ../point_smooth
        chmod +x build_cpp.sh 2>/dev/null || true
        ./build_cpp.sh 2>/dev/null || echo "⚠️  C++ point_smooth skipped"
        
        cd ../../../../..
    fi
else
    echo "⚠️  clang++ not found, skipping C++ builds"
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

