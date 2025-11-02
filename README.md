# Point Cloud Web Tools

A comprehensive benchmarking and testing platform for point cloud processing using multiple languages and execution environments.

![Point Cloud Web Tools Preview](images/pointcloud-webtools-preview.png)

## Overview

This project benchmarks point cloud processing tools across different implementations:
- **Frontend (Browser)**: TypeScript, C++ WASM, Rust WASM
- **Backend (Server)**: C++, Rust, Python
- **Execution Modes**: Main Thread, Web Workers (for WASM)

All implementations use **identical algorithms** to ensure fair, accurate performance comparisons.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and yarn
- C++ compiler (g++ or clang)
- Rust compiler (cargo)
- Python 3.x

### Installation

```bash
# Install all dependencies
yarn install:all

# Build WASM modules
cd frontend
./compile_wasm.sh

# Rebuild backend executables
cd ../backend/src/services/tools
cargo build --release
cd voxel_downsample && g++ -O3 -std=c++17 -march=native -ffast-math -flto -I. -o voxel_downsample voxel_downsample.cpp
```

### Running

```bash
# Start both frontend and backend
yarn dev

# Or run separately
yarn dev:frontend  # Frontend on http://localhost:5173
yarn dev:backend   # Backend on http://localhost:3003
```

## 📊 Benchmark Reports

Detailed benchmark results for each tool:

- **[Voxel Downsampling](docs/benchmark-voxel-downsampling.md)** - Reduce point density using voxel grids
- **[Voxel Debug](docs/benchmark-voxel-debug.md)** - Visualize voxel grid centers
- **[Point Cloud Smoothing](docs/benchmark-point-smoothing.md)** - Gaussian-based point cloud smoothing

## 🛠️ Tools

### 1. Voxel Downsampling
Reduces point cloud density by averaging points within voxel grid cells.

**Implementations:**
- TypeScript (TS)
- C++ WASM (Main Thread & Worker)
- Rust WASM (Main Thread & Worker)
- C++ Backend
- Rust Backend
- Python Backend

**Features:**
- All implementations use `Math.floor()` / `std::floor()` for consistency
- Identical voxel coordinate calculation
- Optimized with integer hashing and chunked processing

### 2. Voxel Debug Visualization
Generates and visualizes voxel grid centers for debugging voxel downsampling.

**Implementations:**
- TypeScript (TS)
- C++ WASM (Main Thread & Worker)
- Rust WASM (Main Thread & Worker)
- C++ Backend
- Rust Backend
- Python Backend

### 3. Point Cloud Smoothing
Applies Gaussian filtering to smooth point cloud data.

**Implementations:**
- TypeScript (TS)
- C++ WASM (Main Thread & Worker)
- Rust WASM (Main Thread & Worker)
- C++ Backend
- Rust Backend
- Python Backend

## 🏗️ Architecture

### Frontend
- **Framework**: React + TypeScript
- **Rendering**: Babylon.js for 3D visualization
- **WASM**: Emscripten (C++) and wasm-bindgen (Rust)
- **Workers**: Web Workers for parallel WASM execution

### Backend
- **Server**: Node.js + Express
- **WebSocket**: Real-time communication for backend processing
- **Executables**: Standalone C++/Rust/Python binaries

## 📁 Project Structure

```
pointcloud-webtools/
├── frontend/              # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── services/      # Tool services and WASM integration
│   │   └── wasm/          # WASM source code
│   └── public/wasm/       # Compiled WASM modules
├── backend/               # Node.js backend
│   └── src/
│       └── services/tools/ # Backend tool implementations
├── docs/                  # Benchmark reports
└── README.md             # This file
```

## 🔬 Benchmark Methodology

All benchmarks are designed for **fair comparison**:

1. **Algorithm Consistency**: All implementations use identical algorithms
   - Same voxel coordinate calculation (`floor()`)
   - Same bounds handling
   - Same hashing strategies

2. **Optimization Level**: Each implementation is optimized for its platform
   - Compiler flags: `-O3 -march=native -ffast-math -flto`
   - Platform-specific optimizations (e.g., RapidJSON for C++, serde_json for Rust)

3. **Measurement**: Processing time measured internally (excludes I/O overhead)

4. **Verification**: All implementations produce **identical results** (same voxel counts and point positions)

## 🎯 Key Findings

### Performance Summary
- **Rust Backend**: Fastest overall (optimized HashMap + serde_json)
- **C++ Backend**: ~2x slower than Rust (std::unordered_map overhead)
- **Python Backend**: Slowest but highly readable and maintainable
- **WASM**: Excellent for browser-based processing with minimal server load

### Best Practices
- Use **Web Workers** for WASM processing to avoid blocking the main thread
- Backend processing preferred for large datasets (>1M points)
- Rust provides best performance-to-maintainability ratio

## 📝 Supported Formats

- **LAZ/LAS**: Traditional point cloud formats
- **COPC**: Cloud Optimized Point Cloud with LOD support

## 🧪 Testing

Each tool can be tested individually through the web interface:
1. Load a point cloud file (LAZ/LAS/COPC)
2. Select a tool (Voxel Downsampling, Smoothing, etc.)
3. Run all implementations
4. View benchmark results in real-time

## 📚 Documentation

- [Backend README](backend/README.md) - Backend setup and API
- [Benchmark Reports](docs/) - Detailed performance analysis

## 📄 License

See [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **RapidJSON**: Fast C++ JSON library
- **serde/serde_json**: Rust serialization framework
- **Babylon.js**: 3D rendering engine
- **Emscripten**: C++ to WebAssembly compiler
- **wasm-bindgen**: Rust to WebAssembly bindings
