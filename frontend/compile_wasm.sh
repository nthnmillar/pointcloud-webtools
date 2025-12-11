#!/bin/bash

# Compile WASM modules
echo "Compiling WASM modules..."

# Get the frontend directory (where this script is located)
FRONTEND_DIR="$(cd "$(dirname "$0")" && pwd)"

# Create wasm directories if they don't exist
mkdir -p "$FRONTEND_DIR/public/wasm/cpp"
mkdir -p "$FRONTEND_DIR/public/wasm/rust"

# Copy laz-perf.wasm from node_modules to wasm folder (optional)
# Get the frontend directory (where this script is located)
FRONTEND_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$FRONTEND_DIR/.." && pwd)"

# Check for laz-perf.wasm in root node_modules (yarn workspaces) or frontend node_modules
LAZ_PERF_WASM=""
if [ -f "$PROJECT_ROOT/node_modules/laz-perf/lib/web/laz-perf.wasm" ]; then
    LAZ_PERF_WASM="$PROJECT_ROOT/node_modules/laz-perf/lib/web/laz-perf.wasm"
elif [ -f "$FRONTEND_DIR/node_modules/laz-perf/lib/web/laz-perf.wasm" ]; then
    LAZ_PERF_WASM="$FRONTEND_DIR/node_modules/laz-perf/lib/web/laz-perf.wasm"
elif [ -f "$PROJECT_ROOT/node_modules/laz-perf/lib/laz-perf.wasm" ]; then
    LAZ_PERF_WASM="$PROJECT_ROOT/node_modules/laz-perf/lib/laz-perf.wasm"
elif [ -f "$FRONTEND_DIR/node_modules/laz-perf/lib/laz-perf.wasm" ]; then
    LAZ_PERF_WASM="$FRONTEND_DIR/node_modules/laz-perf/lib/laz-perf.wasm"
fi

if [ -n "$LAZ_PERF_WASM" ]; then
    cp "$LAZ_PERF_WASM" "$FRONTEND_DIR/public/wasm/laz-perf.wasm"
    echo "✅ Copied laz-perf.wasm to public/wasm/"
else
    # Silently skip if laz-perf is not available (optional dependency)
    echo "⚠️  Warning: laz-perf.wasm not found in node_modules. Run 'yarn install' first."
fi

# Compile unified tools WASM module
echo "Compiling unified tools WASM module..."
EMSCRIPTEN_ROOT=$(dirname $(which emcc))
SYSTEM_INCLUDE="${EMSCRIPTEN_ROOT}/system/include"

emcc "$FRONTEND_DIR/src/wasm/cpp/voxel_downsample.cpp" \
     "$FRONTEND_DIR/src/wasm/cpp/point_cloud_smoothing.cpp" \
     "$FRONTEND_DIR/src/wasm/cpp/voxel_debug.cpp" \
  -I"${SYSTEM_INCLUDE}" \
  -I"$FRONTEND_DIR/src/wasm/cpp" \
  -o "$FRONTEND_DIR/public/wasm/cpp/tools_cpp.js" \
  -std=c++17 \
  -Wno-c++20-extensions \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="ToolsModule" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=16MB \
  -s MAXIMUM_MEMORY=512MB \
  -s ENVIRONMENT="web" \
  -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'HEAPF32', 'HEAPU8']" \
  -s EXPORTED_FUNCTIONS="['_voxelDownsampleDirect', '_voxelDebugDirect', '_malloc', '_free']" \
  -s NO_DISABLE_EXCEPTION_CATCHING=1 \
  -O3 \
  -ffast-math \
  -flto \
  -msimd128 \
  --bind

# Compile COPC loader WASM module
echo "Compiling COPC loader WASM module..."
emcc "$FRONTEND_DIR/src/wasm/cpp/copc_loader.cpp" \
  -o "$FRONTEND_DIR/public/wasm/copc_loader.js" \
  -std=c++17 \
  -Wno-c++20-extensions \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="COPCModule" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=16MB \
  -s MAXIMUM_MEMORY=512MB \
  -O3 \
  --bind

# Compile Rust to WebAssembly
echo "Compiling Rust to WebAssembly..."
if ! command -v wasm-pack &> /dev/null; then
    echo "Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Build Rust to WebAssembly directly to public directory
cd "$FRONTEND_DIR/src/wasm/rust"
mkdir -p "$FRONTEND_DIR/public/wasm/rust"
wasm-pack build --target web --out-dir "$FRONTEND_DIR/public/wasm/rust" --out-name tools_rust
cd "$FRONTEND_DIR"

# Rename _bg files to remove suffix (only tools_rust.wasm should exist)
cd "$FRONTEND_DIR/public/wasm/rust"
if [ -f "tools_rust_bg.wasm" ]; then
    mv tools_rust_bg.wasm tools_rust.wasm
fi
# Update JS file to reference tools_rust.wasm instead of tools_rust_bg.wasm
if [ -f "tools_rust.js" ]; then
    sed -i 's/tools_rust_bg\.wasm/tools_rust.wasm/g' tools_rust.js
fi
# Rename and update WASM .d.ts file
if [ -f "tools_rust_bg.wasm.d.ts" ]; then
    sed 's/tools_rust_bg\.wasm/tools_rust.wasm/g' tools_rust_bg.wasm.d.ts > tools_rust.wasm.d.ts
    rm tools_rust_bg.wasm.d.ts
fi
# Clean up unwanted files
rm -f package.json pointcloud_tools_rust*
cd "$FRONTEND_DIR"

echo "WASM compilation complete!"
echo "Generated files:"
echo "  - public/wasm/cpp/tools_cpp.js"
echo "  - public/wasm/cpp/tools_cpp.wasm"
echo "  - public/wasm/copc_loader.js"
echo "  - public/wasm/copc_loader.wasm"
echo "  - public/wasm/rust/tools_rust.js"
echo "  - public/wasm/rust/tools_rust.wasm"

