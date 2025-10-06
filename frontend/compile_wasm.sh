#!/bin/bash

# Compile WASM modules
echo "Compiling WASM modules..."

# Create wasm directories if they don't exist
mkdir -p public/wasm/cpp
mkdir -p public/wasm/rust

# Copy laz-perf.wasm from node_modules to wasm folder
if [ -f "node_modules/laz-perf/lib/laz-perf.wasm" ]; then
    cp node_modules/laz-perf/lib/laz-perf.wasm public/wasm/
    echo "Copied laz-perf.wasm to public/wasm/"
else
    echo "Warning: laz-perf.wasm not found in node_modules/laz-perf/lib/"
fi

# Compile unified tools WASM module
echo "Compiling unified tools WASM module..."
emcc src/wasm/cpp/tools.cpp \
  -o public/wasm/cpp/tools_cpp.js \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="ToolsModule" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=16MB \
  -s MAXIMUM_MEMORY=512MB \
  -s ENVIRONMENT="web" \
  -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap']" \
  -s NO_DISABLE_EXCEPTION_CATCHING=1 \
  -O3 \
  --bind

# Compile COPC loader WASM module
echo "Compiling COPC loader WASM module..."
emcc src/wasm/cpp/copc_loader.cpp \
  -o public/wasm/copc_loader.js \
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
cd ../..

# Copy only the necessary files to public directory
mkdir -p public/wasm/rust
cp build/wasm/rust/tools_rust.js public/wasm/rust/
cp build/wasm/rust/tools_rust_bg.wasm public/wasm/rust/
cp build/wasm/rust/tools_rust.d.ts public/wasm/rust/
cp build/wasm/rust/tools_rust_bg.wasm.d.ts public/wasm/rust/

echo "WASM compilation complete!"
echo "Generated files:"
echo "  - public/wasm/cpp/tools_cpp.js"
echo "  - public/wasm/cpp/tools_cpp.wasm"
echo "  - public/wasm/copc_loader.js"
echo "  - public/wasm/copc_loader.wasm"
echo "  - public/wasm/rust/tools_rust.js"
echo "  - public/wasm/rust/tools_rust_bg.wasm"

