# Point Cloud Smoothing Benchmark Results

## Overview

Point cloud smoothing applies Gaussian filtering to smooth point cloud data, reducing noise and improving visual quality. This benchmark compares performance across multiple implementations using **O(n) spatial hashing** for efficient neighbor search.

## Algorithm-Specific Details

Point cloud smoothing uses **O(n) spatial hashing** algorithm (different from voxel operations):

- **Method**: Gaussian-weighted averaging of neighbors within smoothing radius
- **Spatial Indexing**: Grid-based spatial hash (O(n) complexity) - organizes points into a 3D grid for efficient neighbor lookup
- **Neighbor Search**: Checks 3x3x3 = 27 neighboring grid cells per point (only checks nearby cells, not all points)
- **Iterations**: Multiple passes for stronger smoothing
- **Algorithm Type**: Grid-based operations (different from HashMap-heavy voxel downsampling)

**Key Difference**: This algorithm uses grid-based neighbor search, which is different from HashMap-heavy operations. This explains why C++ performs similarly to Rust here (unlike voxel downsampling where Rust is 2x faster).

See [Benchmark Methodology](benchmark.md#benchmark-methodology) for general algorithm consistency details.

## Benchmark Results

### Test Dataset: 5,832 Points
- **Smoothing Radius**: 0.5
- **Iterations**: 3
- **Output Points**: 5,832 (same as input - smoothing doesn't change count)

### Performance (Processing Time)

| Implementation | Time (ms) | Relative Speed | Notes |
|---------------|-----------|----------------|-------|
| **Rust WASM Worker** | ~29 ms | 1.0x (fastest) | Best browser performance |
| **Rust WASM Main** | ~32 ms | 1.1x | Fast but blocks UI |
| **C++ WASM Main** | ~36 ms | 1.2x | Good performance |
| **TypeScript** | ~52 ms | 1.8x | Good for small datasets |
| **C++ WASM Worker** | ~55 ms | 1.9x | Worker overhead visible |
| **Rust Backend** | ~57 ms | 2.0x | Fastest backend |
| **C++ Backend** | ~60 ms | 2.1x | Very close to Rust BE |
| **Python Backend** | ~1,048 ms | 36x | Slow but readable |

### Performance Analysis

#### Browser Performance (WASM)
- **Rust WASM Worker** is fastest (~29ms):
  - Optimized wasm-bindgen bindings
  - Efficient memory access patterns
  - Excellent compiler optimizations
  
- **Rust WASM Main** is close (~32ms):
  - Same optimizations but runs on main thread
  - Slight overhead from UI thread
  
- **C++ WASM Main** performs well (~36ms):
  - Good performance with Emscripten
  - Direct memory access optimized
  
- **C++ WASM Worker** is slower (~55ms):
  - Worker message passing overhead for small datasets
  - For larger datasets, overhead becomes negligible
  
- **TypeScript** is acceptable (~52ms):
  - Good performance for small-medium datasets
  - No WASM overhead

#### Backend Performance
- **Rust Backend** and **C++ Backend** are **very close** (~57ms vs ~60ms):
  - Much better parity than voxel downsampling (where C++ was 2x slower)
  - Spatial hashing algorithm is less HashMap-dependent
  - Both use efficient grid-based indexing
  
- **Python Backend** is significantly slower (~1,048ms):
  - ~18x slower than Rust/C++ backends
  - Same algorithm but Python interpreter overhead
  - Consider NumPy or Cython for production use

### Why Better Parity Than Voxel Downsampling?

In voxel downsampling, C++ was ~2x slower due to:
- Heavy HashMap usage (std::unordered_map vs Rust's optimized HashMap)

In point smoothing, both are similar because:
- **Grid-based indexing** instead of HashMap (less hash overhead)
- **Spatial hash** uses simple array indexing (very efficient in both)
- Less dependency on standard library HashMap performance

## Algorithm Details

### O(n) Spatial Hashing
1. **Grid Creation**: Divide space into grid cells (cell size = smoothing radius)
2. **Grid Population**: Assign each point to its grid cell (O(n))
3. **Neighbor Search**: For each point, check 27 neighboring cells (3x3x3)
4. **Gaussian Weighting**: Weight neighbors by distance (squared radius check)
5. **Update**: Average weighted neighbors to smooth position

### Parameters
- **smoothingRadius**: Maximum distance to consider neighbors (also grid cell size)
- **iterations**: Number of smoothing passes (more = smoother but slower)

### Optimizations Applied
- Pre-calculated `radiusSquared` (avoid sqrt in inner loop)
- Pre-calculated `invCellSize` (multiplication instead of division)
- Pre-allocated grid vectors (avoid dynamic growth)
- Direct memory access where possible
- Spatial hashing reduces search space from O(n²) to O(n)

## Accuracy Verification

All implementations produce **identical results**:
- ✅ Same smoothed point count (same as input)
- ✅ Same point positions (within floating-point precision)
- ✅ Same algorithm ensures identical smoothing behavior

## Key Findings

### Performance Summary
- **Rust WASM Worker**: Fastest overall (~29ms)
- **Backend Parity**: Rust and C++ backends very close (~57-60ms)
- **Python Backend**: Significantly slower (~1,048ms) but readable
- **Worker Overhead**: Visible on small datasets, negligible on large datasets

### Why Backend Parity is Better
Unlike voxel downsampling where C++ was 2x slower, smoothing shows excellent parity:
- Grid-based spatial indexing is equally efficient in both languages
- Less HashMap dependency (only used for spatial grid, not per-point)
- Both compilers optimize grid operations very well

## Recommendations

### For Small-Medium Datasets (< 50K points)
- Use **Rust WASM Worker** for best browser performance (~29ms)
- **TypeScript** is acceptable for small datasets (~52ms)
- Avoid **C++ WASM Worker** on small datasets (overhead not worth it)

### For Large Datasets (> 50K points)
- Use **Rust WASM Worker** for browser-based processing
- Use **Rust Backend** or **C++ Backend** for server-side (both similar performance)
- Worker overhead becomes negligible on large datasets

### For Production
- **Browser**: Use Rust WASM Worker (best performance)
- **Backend**: Rust or C++ (both excellent, choose based on team expertise)
- **Python**: Only for prototyping or if team primarily uses Python

## Technical Notes

### Spatial Hashing Algorithm
The O(n) spatial hashing algorithm:
1. Creates a 3D grid where cell size = smoothing radius
2. Each point is assigned to a grid cell
3. For smoothing, checks 27 neighboring cells (3x3x3)
4. Only points in neighboring cells need distance checks
5. Reduces complexity from O(n²) to O(n) for typical point distributions

### Grid Index Calculation
All implementations use identical grid indexing:
```cpp
// C++
int gx = static_cast<int>((x - minX) * invCellSize);
int gy = static_cast<int>((y - minY) * invCellSize);
int gz = static_cast<int>((z - minZ) * invCellSize);
int gridIndex = gx + gy * gridWidth + gz * gridWidth * gridHeight;
```

### Worker Overhead
For small datasets (< 10K points), Web Worker message passing overhead is noticeable:
- **C++ WASM Worker**: ~55ms vs Main ~36ms (19ms overhead)
- Overhead becomes negligible on larger datasets (> 100K points)
- Always use workers for large datasets to avoid UI blocking

## Conclusion

All implementations use **identical O(n) spatial hashing algorithms** and produce **identical results**. The performance differences reflect platform optimizations:

- **WASM**: Rust is fastest due to optimized bindings and compiler
- **Backend**: Rust and C++ are nearly equivalent (excellent parity)
- **Python**: Much slower but highly readable

Unlike voxel downsampling, point smoothing shows excellent backend performance parity because the algorithm relies less on HashMap performance and more on grid-based indexing, which is equally efficient in both languages.
