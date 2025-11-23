# Benchmarking

This project provides comprehensive benchmarks comparing point cloud processing tools across multiple languages (TypeScript, C++, Rust, Python) and execution environments (browser WASM, backend servers). The goal is to provide fair, accurate performance comparisons to inform technology choices for point cloud processing applications.

## Purpose

These benchmarks compare **identical algorithms** implemented across different languages and execution environments, ensuring fair comparisons. All implementations use the same core logic with platform-specific optimizations, allowing us to measure true performance differences between languages and execution models.

## 🛠️ Tools

All tools are implemented across the same execution environments:

- **Voxel Downsampling** - Reduces point cloud density by averaging points within voxel grid cells
- **Voxel Debug Visualization** - Generates wireframe cubes representing each voxel grid cell for debugging
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
- **[Voxel Debug](benchmark-voxel-debug.md)** - Visualize voxel grid as wireframe cubes
- **[Point Cloud Smoothing](benchmark-point-smoothing.md)** - Gaussian-based point cloud smoothing

## Benchmark Methodology

### Algorithm Consistency

All implementations use **identical algorithms** to ensure fair comparison:

- **Coordinate Calculation**: All use `floor()` for consistent coordinate conversion (e.g., `Math.floor()` in TypeScript, `std::floor()` in C++, `.floor()` in Rust)
- **Bounds**: Pre-calculated `globalBounds` passed as parameters (not computed inside algorithms) - ensures identical coordinate space across all implementations
- **Hashing Strategy**: 
  - **C++/Rust/Python**: Integer-based hashing with bit shifting `(voxelX << 32) | (voxelY << 16) | voxelZ` - packs three coordinates into one 64-bit integer key for maximum performance
  - **TypeScript**: String-based keys (`"${voxelX},${voxelY},${voxelZ}"`) due to JavaScript's 32-bit integer limitations - works correctly but slower than integer keys
- **Result Verification**: All implementations produce identical outputs (same point counts, positions within floating-point precision)

### Common Optimizations Applied

All implementations use production-level optimizations:

- **Pre-calculated inverses**: `1.0 / value` calculated once, then multiplication used instead of division (multiplication is faster)
- **Chunked processing**: Processes data in chunks (typically 1024 items) for better CPU cache locality
- **Direct memory access**: Minimizes data copying overhead
- **Binary protocol**: Backend implementations use WebSocket with binary I/O instead of JSON (eliminates serialization overhead)
- **Compiler optimizations**: 
  - C++/Rust: `-O3 -march=native -ffast-math -flto` (maximum optimization, CPU-specific, link-time optimization)
  - Python (Cython): Compiled to C with same optimization flags

### Implementation Structure

All tools are implemented across the same execution environments:

- **TypeScript (TS)**: Pure JavaScript implementation, suitable for small datasets and reference
- **C++ WASM & Rust WASM**: Browser-based WebAssembly implementations
  - **Main Thread**: Direct execution (may block UI for large datasets)
  - **Worker**: Background processing via Web Workers (non-blocking, recommended for large datasets)
- **C++ Backend & Rust Backend**: Server-side native executables
  - **C++**: Compiled with clang++ using maximum optimizations
  - **Rust**: Compiled with rustc using maximum optimizations
  - Both use binary protocol (WebSocket + binary I/O) for zero-copy data transfer
- **Python Backend (Cython)**: Server-side compiled Python
  - Cython compiles Python code to C, then to native binary
  - Uses type annotations (`cdef`) for C-level performance
  - Same binary protocol as C++/Rust backends

### Timing Methodology

All implementations measure **end-to-end processing time** including:
- Data preparation and copying
- Algorithm execution
- Result formatting and transfer
- Network I/O (for backend implementations)

This provides realistic performance comparisons reflecting actual user experience, not just algorithm execution time.

## 🧪 Testing

Each tool can be tested individually through the web interface:
1. Load a point cloud file (LAZ/LAS)
2. Select a tool (Voxel Downsampling, Smoothing, etc.)
3. Run all implementations
4. View benchmark results in real-time

See the [Summary](benchmark-summary.md) for detailed performance analysis and platform recommendations.

