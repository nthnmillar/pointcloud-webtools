#!/bin/bash

# Compile WASM modules
echo "Compiling WASM modules..."

# Create wasm directory if it doesn't exist
mkdir -p public/wasm

# Copy laz-perf.wasm from node_modules to wasm folder
if [ -f "node_modules/laz-perf/lib/laz-perf.wasm" ]; then
    cp node_modules/laz-perf/lib/laz-perf.wasm public/wasm/
    echo "Copied laz-perf.wasm to public/wasm/"
else
    echo "Warning: laz-perf.wasm not found in node_modules/laz-perf/lib/"
fi

# Compile unified tools WASM module
echo "Compiling unified tools WASM module..."
emcc src/wasm/tools.cpp \
  -o public/wasm/tools.js \
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
emcc src/wasm/copc_loader.cpp \
  -o public/wasm/copc_loader.js \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="COPCModule" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=16MB \
  -s MAXIMUM_MEMORY=512MB \
  -O3 \
  --bind

echo "WASM compilation complete!"
echo "Generated files:"
echo "  - public/wasm/tools.js"
echo "  - public/wasm/tools.wasm"
echo "  - public/wasm/copc_loader.js"
echo "  - public/wasm/copc_loader.wasm"

