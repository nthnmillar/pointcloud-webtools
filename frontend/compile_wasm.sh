#!/bin/bash

# Compile WASM modules
echo "Compiling WASM modules..."

# Create wasm directories if they don't exist
mkdir -p public/wasm/cpp
mkdir -p public/wasm/rust

# Copy laz-perf.wasm from node_modules to wasm folder (optional)
if [ -f "node_modules/laz-perf/lib/laz-perf.wasm" ]; then
    cp node_modules/laz-perf/lib/laz-perf.wasm public/wasm/
    echo "Copied laz-perf.wasm to public/wasm/"
else
    # Silently skip if laz-perf is not available (optional dependency)
    :
fi

# Compile unified tools WASM module
echo "Compiling unified tools WASM module..."
EMSCRIPTEN_ROOT=$(dirname $(which emcc))
SYSTEM_INCLUDE="${EMSCRIPTEN_ROOT}/system/include"

emcc src/wasm/cpp/tools.cpp \
  -I"${SYSTEM_INCLUDE}" \
  -o public/wasm/cpp/tools_cpp.js \
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
  -flto \
  -msimd128 \
  --bind

# Compile COPC loader WASM module
echo "Compiling COPC loader WASM module..."
emcc src/wasm/cpp/copc_loader.cpp \
  -o public/wasm/copc_loader.js \
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

# Navigate to src/wasm/rust directory and build to build directory first
cd src/wasm/rust
wasm-pack build --target web --out-dir ../../build/wasm/rust --out-name tools_rust
cd ../../..

# Copy files to public directory and rename _bg files to remove suffix (only tools_rust.wasm should exist)
mkdir -p public/wasm/rust
# Clean up any old files that might exist (package.json, pointcloud_tools_rust_* files, _bg files)
rm -f public/wasm/rust/package.json \
      public/wasm/rust/pointcloud_tools_rust* \
      public/wasm/rust/tools_rust_bg.wasm \
      public/wasm/rust/tools_rust_bg.wasm.d.ts
# Copy and rename WASM file (tools_rust_bg.wasm -> tools_rust.wasm)
cp src/build/wasm/rust/tools_rust_bg.wasm public/wasm/rust/tools_rust.wasm
# Copy JS file and update references to use tools_rust.wasm instead of tools_rust_bg.wasm
sed 's/tools_rust_bg\.wasm/tools_rust.wasm/g' src/build/wasm/rust/tools_rust.js > public/wasm/rust/tools_rust.js
# Copy TypeScript definitions
cp src/build/wasm/rust/tools_rust.d.ts public/wasm/rust/
# Copy and rename WASM .d.ts file, updating references
    sed 's/tools_rust_bg\.wasm/tools_rust.wasm/g' src/build/wasm/rust/tools_rust_bg.wasm.d.ts > public/wasm/rust/tools_rust.wasm.d.ts

echo "WASM compilation complete!"
echo "Generated files:"
echo "  - public/wasm/cpp/tools_cpp.js"
echo "  - public/wasm/cpp/tools_cpp.wasm"
echo "  - public/wasm/copc_loader.js"
echo "  - public/wasm/copc_loader.wasm"
echo "  - public/wasm/rust/tools_rust.js"
echo "  - public/wasm/rust/tools_rust.wasm"

