# Benchmarking

This project provides comprehensive benchmarks comparing point cloud processing tools across multiple languages (TypeScript, C++, Rust, Python) and execution environments (browser WASM, backend servers). Benchmarking is the main purpose - comparing performance across languages and execution environments to inform technology choices.

## 🛠️ Tools

All tools are implemented across the same execution environments:

- **Voxel Downsampling** - Reduces point cloud density by averaging points within voxel grid cells
- **Voxel Debug Visualization** - Generates and visualizes voxel grid centers for debugging
- **Point Cloud Smoothing** - Applies Gaussian filtering to smooth point cloud data

**Implementations per tool:**
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

1. **Algorithm Consistency**: All implementations use identical algorithms
   - Same voxel coordinate calculation (`floor()`)
   - Same bounds handling
   - Same hashing strategies

2. **Optimization Level**: Each implementation is optimized for its platform
   - Compiler flags: `-O3 -march=native -ffast-math -flto`
   - Platform-specific optimizations (e.g., RapidJSON for C++, serde_json for Rust)

3. **Timing**: Processing time measures only the algorithm execution (network I/O, JSON parsing, and data copying are excluded). All implementations produce identical results (same voxel counts and point positions).

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

