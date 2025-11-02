# Benchmarking

This project provides comprehensive benchmarks comparing point cloud processing tools across multiple languages (TypeScript, C++, Rust, Python) and execution environments (browser WASM, backend servers). Benchmarking is one of the core purposes - comparing performance across languages and execution environments to inform technology choices.

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

## 📊 Benchmark Reports

- **[Summary](benchmark-summary.md)** - Executive summary and overall findings

Detailed benchmark results for each tool:

- **[Voxel Downsampling](benchmark-voxel-downsampling.md)** - Reduce point density using voxel grids
- **[Voxel Debug](benchmark-voxel-debug.md)** - Visualize voxel grid centers
- **[Point Cloud Smoothing](benchmark-point-smoothing.md)** - Gaussian-based point cloud smoothing

## Benchmark Methodology

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

## 🧪 Testing

Each tool can be tested individually through the web interface:
1. Load a point cloud file (LAZ/LAS/COPC)
2. Select a tool (Voxel Downsampling, Smoothing, etc.)
3. Run all implementations
4. View benchmark results in real-time

## Quick Findings

- **Rust**: Fastest overall (both WASM and backend)
- **C++**: Performance depends on algorithm type - HashMap-heavy workloads favor Rust (2x faster), grid-based workloads are nearly equivalent
- **Python**: Slowest but highly readable
- **Critical Insight**: Algorithm characteristics determine when language choice matters most

See the [Summary](benchmark-summary.md) for detailed performance analysis and platform recommendations.

