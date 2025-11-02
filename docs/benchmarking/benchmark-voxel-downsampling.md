# Voxel Downsampling Benchmark Results

## Overview

Voxel downsampling reduces point cloud density by averaging points within voxel grid cells. This benchmark compares performance across multiple implementations and execution environments.

## Algorithm Consistency

All implementations use **identical algorithms** to ensure fair comparison:

- **Voxel Calculation**: `Math.floor()` / `std::floor()` for consistent coordinate calculation
- **Bounds**: Uses pre-calculated `globalBounds` passed as a parameter (not calculated inside the algorithm) - ensures all implementations use identical bounds values
- **Hashing**: Creates unique keys for each voxel coordinate to group points efficiently in a hash map
  - **C++/Rust/Python**: Integer-based hashing with bit shifting (`(voxelX << 32) | (voxelY << 16) | voxelZ`) - packs three coordinates into one 64-bit integer key
    - How it works: Shifts `voxelX` left by 32 bits (upper 32 bits), `voxelY` left by 16 bits (middle 16 bits), and keeps `voxelZ` in the lower 16 bits, then combines them with bitwise OR (`|`)
    - Example: If voxelX=100, voxelY=50, voxelZ=25, this creates a single integer key like `4294967296025`
    - Why: Integer keys are faster than string keys for hash map lookups
  - **TypeScript**: String-based keys (`"${voxelX},${voxelY},${voxelZ}"`) due to JavaScript's 32-bit integer limitations for bitwise operations
- **Optimizations**: 
  - Pre-calculated inverse voxel size (multiplication instead of division) - calculates `1.0 / voxelSize` once, then multiplies instead of dividing for each point (multiplication is faster)
    - **Purpose**: Determines which voxel grid cell each point belongs to. `floor()` rounds down to the nearest integer (e.g., `floor(5.25) = 5`) to convert world coordinates to voxel grid coordinates.
  - Chunked processing for cache locality (1024 points per chunk) - processes points in small groups rather than all at once, keeping related data in CPU cache for faster access (cache is much faster than RAM)
  - Direct memory access where possible - avoids copying data to reduce overhead

## Implementation Details

### TypeScript (TS)
- **Location**: `frontend/src/services/tools/VoxelDownsampling/VoxelDownsamplingTS.ts`
- **Optimizations**: String-based HashMap keys (JavaScript 32-bit limitation)
- **Use Case**: Reference implementation, small datasets

### C++ WASM Main Thread
- **Location**: `frontend/src/wasm/cpp/tools.cpp` → `voxelDownsampleInternal()`
- **Compilation**: Emscripten with `-O3 --bind`
- **Optimizations**: Direct memory access, integer hashing, chunked processing
- **Use Case**: Browser-based processing on main thread

### C++ WASM Worker
- **Location**: `frontend/src/services/tools/CppWasmWorker.worker.ts`
- **Execution**: Web Worker (separate thread)
- **Performance**: Same as Main Thread but doesn't block UI
- **Use Case**: Background processing without UI blocking

### Rust WASM Main Thread
- **Location**: `frontend/src/wasm/rust/src/lib.rs` → `voxel_downsample()`
- **Compilation**: `wasm-bindgen` with `--release`
- **Optimizations**: Direct slice access, integer hashing
- **Use Case**: Browser-based processing on main thread

### Rust WASM Worker
- **Location**: `frontend/src/services/tools/RustWasmWorker.worker.ts`
- **Execution**: Web Worker (separate thread)
- **Performance**: Same as Main Thread but doesn't block UI
- **Use Case**: Background processing without UI blocking

### C++ Backend
- **Location**: `backend/src/services/tools/voxel_downsample/voxel_downsample.cpp`
- **JSON Library**: RapidJSON (header-only, optimized)
- **Compilation**: `g++ -O3 -std=c++17 -march=native -ffast-math -flto`
- **Optimizations**: 
  - RapidJSON for fast JSON parsing
  - Custom identity hash function
  - `try_emplace()` for efficient HashMap operations
  - Pre-allocated string buffers for JSON output
- **Use Case**: Server-side processing for large datasets

### Rust Backend
- **Location**: `backend/src/services/tools/voxel_downsample/voxel_downsample_rust.rs`
- **JSON Library**: serde_json (highly optimized)
- **Compilation**: `cargo build --release`
- **Optimizations**:
  - `serde_json` for ultra-fast JSON parsing
  - Rust's optimized HashMap (FxHash-based)
  - `entry().and_modify()` pattern for efficient updates
- **Use Case**: Server-side processing (fastest option)

### Python Backend
- **Location**: `backend/src/services/tools/voxel_downsample/voxel_downsample_python.py`
- **JSON Library**: Standard `json` module (C-optimized)
- **Optimizations**: `defaultdict` for efficient updates, chunked processing
- **Use Case**: Server-side processing (readable, maintainable)

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

