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

### Test Dataset: 20,000 Points
- **Smoothing Radius**: 0.5
- **Iterations**: 3
- **Output Points**: 20,000 (same as input - smoothing doesn't change count)

### Performance (Processing Time)

| Implementation | Time (ms) | Relative Speed | Notes |
|---------------|-----------|----------------|-------|
| **Rust WASM Worker** | 118 ms | 1.0x (fastest) | Best browser performance |
| **Rust WASM Main** | 143 ms | 1.21x | Fast but blocks UI |
| **C++ WASM Main** | 378 ms | 3.20x | Good performance |
| **C++ WASM Worker** | 402 ms | 3.41x | Worker overhead visible |
| **TypeScript** | 885 ms | 7.50x | Acceptable for small-medium datasets |
| **Rust Backend** | 200 ms | 1.69x | Fastest backend |
| **C++ Backend** | 370 ms | 3.14x | Good performance |
| **Python Backend (Cython)** | 687 ms | 5.83x | Compiled Python, good performance |

### Performance Analysis

#### Browser Performance (WASM)
- **Rust WASM Worker** is fastest (118ms):
  - Optimized wasm-bindgen bindings
  - Efficient memory access patterns
  - Excellent compiler optimizations
  - Best choice for browser-based processing
  
- **Rust WASM Main** is close (143ms):
  - Same optimizations but runs on main thread
  - Slight overhead from UI thread
  
- **C++ WASM Main** performs well (378ms):
  - Good performance with Emscripten
  - Direct memory access optimized
  - ~2.6x slower than Rust WASM Main
  
- **C++ WASM Worker** is slower (402ms):
  - Worker message passing overhead
  - Similar performance to C++ WASM Main
  
- **TypeScript** is acceptable (885ms):
  - Good performance for small-medium datasets
  - No WASM overhead
  - ~7.5x slower than Rust WASM Worker

#### Backend Performance
- **Rust Backend** is fastest (200ms):
  - Excellent performance with spatial hashing
  - Optimized `Vec<Vec<usize>>` memory layout
  - Efficient iterator optimizations
  
- **C++ Backend** is slower (370ms):
  - ~85% slower than Rust BE (370ms vs 200ms)
  - Uses `std::vector<std::vector<int>>` which has worse cache locality
  - Grid-based operations favor Rust's memory layout
  - **Key Finding**: Unlike voxel downsampling (where C++ is faster), point smoothing favors Rust due to grid memory access patterns
  
- **Python Backend (Cython)** is slower (687ms):
  - ~3.4x slower than Rust BE
  - Compiled Python code (Cython → C → native binary)
  - Much better than pure Python (~1,048ms before)
  - Good performance for compiled Python code

### Why Different Performance Pattern Than Voxel Downsampling?

**Voxel Downsampling**: C++ BE is faster (476ms vs 618ms, ~30% faster)
- Heavy HashMap usage favors C++'s `std::unordered_map` performance
- Hash operations are well-optimized in C++

**Point Smoothing**: Rust BE is faster (200ms vs 370ms, ~85% faster)
- Grid-based operations favor Rust's `Vec<Vec<usize>>` memory layout
- Better cache locality with Rust's contiguous memory allocation
- C++'s `std::vector<std::vector<int>>` has separate allocations per inner vector, causing cache misses
- Spatial hashing algorithm benefits from Rust's iterator optimizations

**Key Insight**: Different algorithms favor different languages based on their memory access patterns and data structure efficiency.

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
- Use **Rust WASM Worker** for best browser performance (118ms)
- **TypeScript** is acceptable for small datasets (885ms)
- **C++ WASM Main** is good alternative (378ms)

### For Large Datasets (> 50K points)
- Use **Rust WASM Worker** for browser-based processing
- Use **Rust Backend** for server-side (fastest, 200ms)
- **C++ Backend** is good alternative (370ms)
- Worker overhead becomes negligible on large datasets

### For Production
- **Browser**: Use Rust WASM Worker (best performance, 118ms)
- **Backend**: Prefer Rust Backend (fastest, 200ms) or C++ Backend (370ms)
- **Python (Cython)**: Good performance (687ms) if team prefers Python ecosystem

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
For small-medium datasets, Web Worker message passing overhead is noticeable:
- **C++ WASM Worker**: 402ms vs Main 378ms (24ms overhead)
- **Rust WASM Worker**: 118ms vs Main 143ms (actually faster due to parallelization)
- Overhead becomes negligible on larger datasets (> 100K points)
- Always use workers for large datasets to avoid UI blocking

## Conclusion

All implementations use **identical O(n) spatial hashing algorithms** and produce **identical results**. The performance differences reflect platform optimizations:

- **WASM**: Rust is fastest (118ms) due to optimized bindings and compiler
- **Backend**: Rust is fastest (200ms), C++ is good (370ms), Python (Cython) is acceptable (687ms)
- **Key Finding**: Unlike voxel downsampling (where C++ BE is faster), point smoothing favors Rust BE due to better memory layout and cache locality

**Performance Pattern Summary**:
- **Voxel Downsampling**: C++ BE > Rust BE (hash map operations favor C++)
- **Point Smoothing**: Rust BE > C++ BE (grid memory access patterns favor Rust)
