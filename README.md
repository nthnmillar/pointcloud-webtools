# Point Cloud Web Tools

A comprehensive benchmarking and testing platform for point cloud processing using multiple languages and execution environments.

![Point Cloud Web Tools Preview](images/pointcloud-webtools-preview.png)

## Overview

This project provides a platform for building and **benchmarking** point cloud processing tools across different implementations. Benchmarking is one of the core purposes - comparing performance across languages and execution environments to inform technology choices.

**Current Tools:**
- **Frontend (Browser)**: TypeScript, C++ WASM, Rust WASM
- **Backend (Server)**: C++, Rust, Python
- **Execution Modes**: Main Thread, Web Workers (for WASM)

All implementations use **identical algorithms** to ensure fair, accurate performance comparisons. More tools are planned for future development.

**Current Implementations:**
- Voxel Downsampling
- Voxel Debug Visualization
- Point Cloud Smoothing

## 🚀 Quick Start

```bash
# Install dependencies
yarn

# Start development server (frontend + backend)
yarn dev
```

### Prerequisites
- **Node.js 18+** and yarn
- **Emscripten** (`emcc`) - Required for building C++ WASM modules (frontend auto-builds on startup)
- **Rust** (cargo) - Required for building Rust WASM modules (`wasm-pack` auto-installs if missing)
- **Python 3.x** - Optional, only needed for Python backend tools

## 📊 Benchmark Reports

- **[Summary](docs/benchmark-summary.md)** - Executive summary and overall findings

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

- **Rust**: Fastest overall (both WASM and backend)
- **C++**: Performance depends on algorithm type - HashMap-heavy workloads favor Rust (2x faster), grid-based workloads are nearly equivalent
- **Python**: Slowest but highly readable
- **Critical Insight**: Algorithm characteristics determine when language choice matters most

See the [Benchmark Summary](docs/benchmark-summary.md) for detailed performance analysis and platform recommendations.

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
