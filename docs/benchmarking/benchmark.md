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

### Algorithm Consistency

All implementations use **identical algorithms** to ensure fair comparison:

- **Voxel Calculation**: `Math.floor()` / `std::floor()` for consistent coordinate calculation - all use `floor()` to convert world coordinates to voxel grid coordinates, ensuring consistent rounding
- **Bounds**: Uses pre-calculated `globalBounds` passed as a parameter (not calculated inside the algorithm) - ensures all implementations use identical bounds values and coordinate space
- **Hashing**: Creates unique keys for each voxel coordinate to group points efficiently in a hash map
  - **C++/Rust/Python**: Integer-based hashing with bit shifting (`(voxelX << 32) | (voxelY << 16) | voxelZ`) - packs three coordinates into one 64-bit integer key
    - How it works: Shifts `voxelX` left by 32 bits (upper 32 bits), `voxelY` left by 16 bits (middle 16 bits), and keeps `voxelZ` in the lower 16 bits, then combines them with bitwise OR (`|`)
    - Example: If voxelX=100, voxelY=50, voxelZ=25, this creates a single integer key like `4294967296025`
    - Why faster: Integer keys use less memory (8 bytes vs ~15 bytes), faster to create (bit operations vs string concatenation), and faster to hash (direct integer hash vs scanning characters)
  - **TypeScript**: String-based keys (`"${voxelX},${voxelY},${voxelZ}"`) due to JavaScript's 32-bit integer limitations for bitwise operations - strings work correctly but are slower than integer keys

### Common Optimizations

- **Pre-calculated inverse voxel size**: Calculates `1.0 / voxelSize` once, then multiplies instead of dividing for each point (multiplication is faster)
- **Chunked processing for cache locality**: Processes points in small groups (1024 points per chunk) rather than all at once, keeping related data in CPU cache for faster access (cache is much faster than RAM)
- **Direct memory access**: Avoids copying data to reduce overhead

### Implementation Structure

All tools follow the same implementation structure:

- **TypeScript (TS)**: Reference implementation, suitable for small datasets
- **C++ WASM & Rust WASM**: Both provide Main Thread and Worker implementations
  - **Main Thread**: Browser-based processing (may block UI for large datasets)
  - **Worker**: Background processing via Web Workers (doesn't block UI)
- **C++ Backend & Rust Backend**: Server-side processing for large datasets
  - **C++**: Uses RapidJSON for JSON parsing
  - **Rust**: Uses serde_json for efficient serialization
- **Python Backend**: Server-side processing (readable, maintainable)

### Optimization Level

Each implementation uses production-level optimizations:
- **C++/Rust**: Compiled with maximum optimization settings (`-O3 -march=native -ffast-math -flto`)
- **Platform-specific libraries**: RapidJSON for C++ (fast JSON parsing), serde_json for Rust (efficient serialization)

### Timing

**Frontend implementations (TypeScript, WASM)**: Measure from function call start to result completion, including algorithm execution and result conversion.

**Backend implementations**: 
- **Rust BE & Python BE**: Measure **end-to-end** from button press to visual result (includes network I/O, JSON parsing, data copying, algorithm execution, and visualization)
- **C++ BE**: Uses backend's internal timing which starts after JSON parsing and data copying (excludes I/O overhead but includes algorithm execution)

**Note**: Backend executables internally measure algorithm execution time (after JSON parsing). Rust and Python BE frontend handlers override this with end-to-end timing, while C++ BE uses the internal timing. This means C++ BE timing excludes network I/O overhead, making direct comparisons with Rust/Python BE timing slightly different in scope.

All implementations produce identical results (same voxel counts and point positions).

## 🧪 Testing

Each tool can be tested individually through the web interface:
1. Load a point cloud file (LAZ/LAS)
2. Select a tool (Voxel Downsampling, Smoothing, etc.)
3. Run all implementations
4. View benchmark results in real-time

See the [Summary](benchmark-summary.md) for detailed performance analysis and platform recommendations.

