# Voxel Downsampling Benchmark Results

## Overview

Voxel downsampling reduces point cloud density by averaging points within voxel grid cells. This benchmark compares performance across multiple implementations and execution environments.

## Algorithm-Specific Details

Voxel downsampling averages points within each voxel grid cell:
- Points are grouped by their voxel coordinates using HashMap/HashSet
- Each voxel produces one downsampled point (average of all points in that voxel)
- Algorithm uses HashMap-heavy operations (grouping and averaging)

See [Benchmark Methodology](benchmark.md#benchmark-methodology) for general algorithm consistency details.

## Benchmark Results

### Test Dataset: ~1.2M Points
- **Voxel Size**: 2.0
- **Original Points**: ~1,200,000
- **Downsampled Points**: ~31,700 (expected across all implementations)

### Performance (Processing Time)

| Implementation | Time (ms) | Relative Speed | Notes |
|---------------|-----------|----------------|-------|
| **Rust WASM Worker** | ~1-2 ms | 1.0x (fastest WASM) | Best for browser |
| **Rust WASM Main** | ~1-2 ms | 1.0x | Fast but blocks UI |
| **TypeScript** | ~1-3 ms | 1.0-1.5x | Good for small datasets |
| **C++ WASM Worker** | ~3-4 ms | 1.5-2x | Good performance |
| **C++ WASM Main** | ~4-6 ms | 2-3x | Blocks UI |
| **Rust Backend** | ~1,700-1,900 ms | Baseline | Fastest backend |
| **C++ Backend** | ~3,700-3,900 ms | 2.0-2.3x | Good, but slower HashMap |
| **Python Backend** | ~4,600-4,700 ms | 2.4-2.8x | Slowest but readable |

### Performance Analysis

#### Browser Performance (WASM)
- **Rust WASM** is fastest (~1-2ms) due to:
  - Optimized wasm-bindgen bindings
  - Efficient memory access
  - Better compiler optimizations
  
- **C++ WASM** is slightly slower (~3-6ms) due to:
  - Emscripten overhead
  - JavaScript binding overhead

- **TypeScript** performs well for small datasets due to V8 optimizations

#### Backend Performance
- **Rust Backend** is fastest (~1.7s) due to:
  - `serde_json` ultra-fast JSON parsing
  - Optimized HashMap implementation (FxHash-based)
  - Excellent compiler optimizations

- **C++ Backend** is ~2x slower (~3.7s) due to:
  - `std::unordered_map` overhead (vs Rust's optimized HashMap)
  - RapidJSON parsing overhead (still faster than manual parsing)
  
- **Python Backend** is slowest (~4.6s) but most maintainable

### Accuracy Verification

All implementations produce **identical results**:
- ✅ Same downsampled point count (±1% variance due to input differences)
- ✅ Same voxel count
- ✅ Same point positions (within floating-point precision)

## Key Optimizations Applied

### 1. Voxel Coordinate Calculation
```cpp
// C++
int voxelX = static_cast<int>(std::floor((x - minX) * invVoxelSize));
```
```rust
// Rust
let voxel_x = ((x - bounds.min_x) * inv_voxel_size).floor() as i32;
```
```typescript
// TypeScript
const voxelX = Math.floor((x - params.globalBounds.minX) * invVoxelSize);
```
All use `floor()` to handle negative coordinates correctly.

### 2. Integer Hashing
All implementations use bit-shifting for efficient hashing:
```cpp
uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                   (static_cast<uint64_t>(voxelY) << 16) |
                   static_cast<uint64_t>(voxelZ);
```

### 3. Chunked Processing
Processes points in chunks of 1024 for better cache locality:
```cpp
const int CHUNK_SIZE = 1024;
for (int chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
    // Process chunk
}
```

## Recommendations

### For Small Datasets (< 100K points)
- Use **Rust WASM Worker** or **TypeScript** in the browser
- Minimal latency, no server load

### For Medium Datasets (100K - 1M points)
- Use **Rust WASM Worker** for real-time processing
- Or **Rust Backend** for server-side processing

### For Large Datasets (> 1M points)
- Use **Rust Backend** (fastest overall)
- **C++ Backend** if Rust unavailable (still good performance)
- Avoid Python Backend for time-critical applications

## Technical Notes

### Why Rust Backend is Fastest
1. **serde_json**: Highly optimized JSON parser written in Rust
2. **HashMap**: Uses FxHash by default (faster than std::unordered_map)
3. **Zero-copy**: Works directly with parsed slices
4. **Compiler**: Excellent optimization with `--release`

### Why C++ Backend is Slower
1. **std::unordered_map**: Less optimized than Rust's HashMap
2. **RapidJSON**: Fast but may have slight overhead vs serde_json
3. **Memory Layout**: Tuple vs struct may have cache implications

### Future Optimizations (C++ Backend)
- Consider flat hash map libraries (`absl::flat_hash_map` or `ankerl::unordered_dense::map`)
- Could reduce time by 20-30% (to ~2.6-3.0s)

## Conclusion

All implementations are **fair, optimized, and produce identical results**. The performance differences reflect platform-specific optimizations rather than algorithm differences. Rust provides the best performance-to-maintainability ratio for both WASM and backend implementations.

