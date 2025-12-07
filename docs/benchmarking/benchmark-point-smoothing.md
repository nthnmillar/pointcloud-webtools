# Point Cloud Smoothing Benchmark Results

## Overview

Point cloud smoothing applies Gaussian filtering to smooth point cloud data using **O(n) spatial hashing**. This is a **grid-based algorithm** - performance depends on grid memory access patterns rather than HashMap operations.

## Algorithm Characteristics

- **Type**: Grid-based (spatial indexing with array access)
- **Complexity**: O(n) where n is the number of points
- **Method**: Gaussian-weighted averaging of neighbors within smoothing radius
- **Spatial Indexing**: 3D grid for efficient neighbor lookup (checks 3x3x3 = 27 neighboring cells per point)
- **Key Operations**:
  - Grid cell assignment (O(n))
  - Neighbor search in 27 neighboring cells
  - Gaussian-weighted averaging
- **Data Structure**: Grid-based arrays (different from HashMap-heavy algorithms)

**Key Difference**: This algorithm uses grid-based operations, which explains why performance patterns differ from HashMap-heavy algorithms like voxel downsampling.

See [Benchmark Methodology](benchmark.md) for general implementation details.

## Benchmark Results

### Test Dataset: 200,000 Points

- **Smoothing Radius**: 0.5
- **Iterations**: 3
- **Output Points**: 200,000 (same as input - smoothing doesn't change count)

### Performance (Processing Time)

| Implementation              | Time (ms) | Relative Speed | Notes                     |
| --------------------------- | --------- | -------------- | ------------------------- |
| **C++ Backend**             | 541 ms    | 1.0x           | Fastest overall           |
| **Rust WASM Main**          | 577 ms    | 1.07x          | Fastest WASM              |
| **Rust WASM Worker**        | 677 ms    | 1.25x          | Good WASM performance     |
| **C++ WASM Main**           | 686 ms    | 1.27x          | Good WASM performance     |
| **C++ WASM Worker**         | 773 ms    | 1.43x          | Good WASM performance     |
| **Rust Backend**            | 799 ms    | 1.48x          | Good backend performance  |
| **TypeScript**              | 2165 ms   | 4.00x          | Good performance, pure JS |
| **Python Backend (Cython)** | 2306 ms   | 4.26x          | Compiled Python, slower   |

### Performance Analysis

#### Browser Performance (WASM)

- **Rust WASM Main** (577ms) is fastest, **Rust WASM Worker** (677ms) is 17% slower
- **C++ WASM Main** (686ms) and **C++ WASM Worker** (773ms) are close to Rust WASM
- **Performance gap**: Rust WASM Main is 19% faster than C++ WASM Main
- **Worker overhead**: ~100-110ms difference between main and worker

#### Backend Performance

- **C++ Backend** (541ms) is **fastest overall** - 48% faster than Rust Backend (799ms)
- **C++ Backend is faster than WASM**: 7% faster than fastest WASM (Rust WASM Main at 577ms)
- **Python Backend (Cython)** (2306ms) is **4.3x slower** than C++ BE
- **Why Backend is Faster than WASM**: Backend is faster than WASM (541ms vs 577ms) despite WebSocket network I/O overhead (~50-100ms for binary protocol + process communication). This algorithm is compute-intensive (grid-based neighbor searches with Gaussian weighting), so computation time is long (541ms). The WebSocket overhead becomes negligible relative to computation time. For slower algorithms, backend processing efficiency outweighs network overhead; for fast algorithms (like voxel downsampling), overhead dominates and WASM wins.

## Test-Specific Details

### O(n) Spatial Hashing Algorithm

1. **Grid Creation**: Divide space into grid cells (cell size = smoothing radius)
2. **Grid Population**: Assign each point to its grid cell (O(n))
3. **Neighbor Search**: For each point, check 27 neighboring cells (3x3x3)
4. **Gaussian Weighting**: Weight neighbors by distance (squared radius check)
5. **Update**: Average weighted neighbors to smooth position

### Memory Layout Impact

- Both C++ and Rust implementations use optimized grid structures
- C++ Backend uses flat array structure for better cache locality
- Rust WASM shows performance advantage over C++ WASM for this algorithm

## Accuracy Verification

All implementations produce **identical results**:

- ✅ Same smoothed point count (same as input)
- ✅ Same point positions (within floating-point precision)
- ✅ Same algorithm ensures identical smoothing behavior

## Recommendations

### Browser (WASM)

- **Rust WASM Main** (577ms) - Fastest WASM
- **Rust WASM Worker** (677ms) - Good WASM performance, non-blocking
- **C++ WASM Main** (686ms) - Good WASM performance
- **C++ WASM Worker** (773ms) - Good WASM performance
- **TypeScript** (2165ms) - Good performance, simpler code

### Backend

- **C++ Backend** (541ms) - Fastest overall for this grid-based algorithm
- **Rust Backend** (799ms) - Good performance, 48% slower than C++ BE
- **Python Cython** (2306ms) - Acceptable if team prefers Python ecosystem

## Key Findings

1. **C++ Backend is fastest overall** (541ms) - 48% faster than Rust Backend (799ms)
2. **C++ Backend is faster than WASM** - 7% faster than fastest WASM (Rust WASM Main at 577ms)
3. **Rust WASM Main is fastest WASM** (577ms) - 19% faster than C++ WASM Main (686ms)
4. **Spatial hashing is O(n)** - efficient neighbor search algorithm
5. **Worker overhead**: ~100-110ms difference between main and worker
6. **Python Cython is 4.3x slower** but provides Python ecosystem benefits

## Conclusion

For point cloud smoothing (grid-based algorithm with O(n) spatial hashing), **C++ Backend provides the best overall performance** (541ms for 200K points) and is faster than all WASM implementations. This contrasts with voxel operations where WASM shows a 2-5x advantage. The difference likely stems from this algorithm being more compute-intensive per point, making backend processing efficiency more significant relative to network I/O overhead.

**Rust WASM Main** (577ms) is fastest for browser-based processing, outperforming C++ WASM Main (686ms) by 19%. WASM implementations are competitive with backend for this algorithm, with the fastest WASM being only 7% slower than the fastest backend.

**TypeScript shows the largest performance gap compared to other tests** - it is 4.0x slower than the fastest implementation (2165ms vs 541ms), compared to only 1.45-1.53x slower in voxel downsampling and voxel debug tests. This suggests that grid-based algorithms with intensive neighbor searches are particularly challenging for JavaScript's JIT compiler compared to HashMap or Set-based operations.

All implementations produce consistent results and are fully optimized.
