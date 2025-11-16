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

### Test Dataset: 1M Points
- **Voxel Size**: 2.0
- **Original Points**: 1,000,000
- **Downsampled Points**: ~25,942 (expected across all implementations)

### Performance (Processing Time)

| Implementation | Time (ms) | Relative Speed | Notes |
|---------------|-----------|----------------|-------|
| **TypeScript** | 217 ms | 1.51x | Good performance, pure JS |
| **C++ WASM Main** | 144 ms | 1.0x | Fastest WASM implementation |
| **Rust WASM Main** | 152 ms | 1.06x | Very close to C++ WASM (5% difference) |
| **C++ WASM Worker** | 195 ms | 1.35x | Good performance with worker overhead |
| **Rust WASM Worker** | 193 ms | 1.34x | Best for browser (non-blocking) |
| **C++ Backend** | 504 ms | Baseline | Fastest backend |
| **Rust Backend** | 614 ms | 1.22x | Very close to C++ BE (22% difference) |
| **Python Backend (Cython)** | 706 ms | 1.40x | Compiled Python, good performance |

### Performance Analysis

#### Browser Performance (WASM) - C++ and Rust are Very Close
- **C++ WASM Main** (144ms) and **Rust WASM Main** (152ms) are **very close** (only 5% difference)
- Both use **LLVM-based compilers**:
  - Rust: Native LLVM compiler
  - C++: Emscripten (LLVM/Clang-based)
- Both benefit from similar LLVM optimizations
- Both use binary protocol (no JSON overhead)
- The small difference is due to hash map implementation details, but LLVM optimizations minimize the gap

#### Backend Performance - C++ and Rust are Very Close
- **C++ Backend** (504ms) is **22% faster** than Rust Backend (614ms)
- **Key Finding**: After optimizing both to use binary protocol (WebSocket + binary I/O), the performance gap is much smaller than previously observed
- **Hash Map Implementation**:
  - **C++**: Uses `std::unordered_map` with `FastHash` (matching Rust's FxHash algorithm)
  - **Rust**: Uses `FxHashMap` (rustc-hash) - optimized for integer keys
- **Compiler**: Both use LLVM (clang for C++, rustc for Rust) with full optimizations:
  - C++: `clang++ -O3 -march=native -ffast-math -flto -stdlib=libc++`
  - Rust: `opt-level = 3, lto = "fat", codegen-units = 1`
- **Conclusion**: The 22% difference is acceptable and reflects minor hash map implementation differences. Both are well-optimized.

#### Python Backend (Cython) Performance
- **Python Backend (Cython)** (706ms) is **40% slower** than C++ Backend (504ms)
- **Cython Implementation**: 
  - Compiled Python code (`.pyx` → C → native binary)
  - Uses type annotations (`cdef int`, `cdef float`) for C-level performance
  - Same Python syntax, compiled to native code
- **Why Slower**:
  - Python dict operations are still the bottleneck (dict lookups/insertions go through Python's C API)
  - Even compiled, Python dicts have overhead compared to C++/Rust hash maps
  - Cython optimizes numeric operations but can't fully optimize dict operations
- **Fair Comparison**: Yes - Cython is compiled Python, comparable to compiled C++/Rust backends

### Accuracy Verification

All implementations produce **identical results**:
- ✅ Same downsampled point count (±1% variance due to input differences)
- ✅ Same voxel count
- ✅ Same point positions (within floating-point precision)

## Key Optimizations Applied

### 1. Binary Protocol (All Backends)
All backend implementations now use **WebSocket with binary protocol** instead of HTTP with JSON:
- **Eliminates JSON serialization overhead** (~369ms saved for 1M points)
- **Zero-copy data transfer**: Direct binary I/O between Node.js and native processes
- **Frontend**: Sends binary data directly via WebSocket (`ws.send(pointCloudData.buffer)`) - no JSON conversion
- **Backend**: Sends binary response directly via WebSocket (`ws.send(downsampledPointsBuffer)`) - no JSON conversion

This optimization was critical - it reduced C++ BE from ~1,549ms to ~504ms (3x faster!).

### 2. Voxel Coordinate Calculation
```cpp
// C++
int voxelX = static_cast<int>(std::floor((x - minX) * invVoxelSize));
```
```rust
// Rust
let voxel_x = ((x - min_x) * inv_voxel_size).floor() as i32;
```
```typescript
// TypeScript
const voxelX = Math.floor((x - params.globalBounds.minX) * invVoxelSize);
```
All use `floor()` to handle negative coordinates correctly.

### 3. Integer Hashing
All implementations use bit-shifting for efficient hashing:
```cpp
uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                   (static_cast<uint64_t>(voxelY) << 16) |
                   static_cast<uint64_t>(voxelZ);
```

### 4. Chunked Processing
Processes points in chunks of 1024 for better cache locality:
```cpp
const int CHUNK_SIZE = 1024;
for (int chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
    // Process chunk
}
```

### 5. Direct Array Indexing (Rust BE)
Rust BE uses direct array indexing instead of `push()` for output generation:
```rust
let mut downsampled_points = vec![0.0f32; output_count * 3];
downsampled_points[output_index * 3] = voxel.sum_x / count_f;
```

### 6. Link Time Optimization (LTO)
Both C++ and Rust backends use LTO for cross-module optimizations:
- **C++**: `-flto` flag
- **Rust**: `lto = "fat"` in `Cargo.toml`

## Recommendations

### For Small Datasets (< 100K points)
- Use **C++ WASM Main** or **Rust WASM Main** in the browser
- Minimal latency, no server load

### For Medium Datasets (100K - 1M points)
- Use **C++ WASM Main** or **Rust WASM Main** for real-time processing
- Or **C++ Backend** or **Rust Backend** for server-side processing (both are very close)

### For Large Datasets (> 1M points)
- Use **C++ Backend** (fastest, ~504ms for 1M points)
- **Rust Backend** is also excellent (~614ms for 1M points, only 22% slower)
- **Python Backend (Cython)** is acceptable (~706ms for 1M points, 40% slower than C++)

## Technical Notes

### Why C++ Backend is Fastest
1. **Binary Protocol**: WebSocket with binary I/O (no JSON overhead)
2. **HashMap**: Uses `std::unordered_map` with `FastHash` (matching Rust's FxHash algorithm)
3. **Compiler**: clang++ with full optimizations (`-O3 -march=native -ffast-math -flto`)
4. **Standard Library**: Uses `libc++` (LLVM's standard library) to match Emscripten's environment

### Why Rust Backend is Close (22% difference)
1. **Binary Protocol**: WebSocket with binary I/O (same as C++)
2. **HashMap**: Uses `FxHashMap` (rustc-hash) - optimized for integer keys
3. **Compiler**: rustc with full optimizations (`opt-level = 3, lto = "fat"`)
4. **Direct Indexing**: Uses direct array indexing instead of `push()` for output

The 22% difference is due to minor hash map implementation differences. Both are well-optimized.

### Python Backend (Cython) Implementation Details
1. **Cython Compilation**:
   - Source: `.pyx` file (Python with type annotations)
   - Compilation: Cython → C → native binary (`.so` file)
   - Compiler flags: `-O3 -march=native -ffast-math` (same as C++/Rust)
2. **Type Annotations**:
   ```cython
   cdef int point_count = len(points) // 3
   cdef float x, y, z
   cdef int voxel_x, voxel_y, voxel_z
   ```
   - `cdef` declares C-level variables (no Python object overhead)
   - Direct C operations for numeric calculations
3. **Binary Protocol**: Uses WebSocket with binary I/O (same as C++/Rust)
4. **Limitations**:
   - Python dict operations still use Python's C API (bottleneck)
   - Python list operations still have overhead
   - Cython can't fully optimize Python object operations
5. **Performance**: 40% slower than C++ BE, but still very good for compiled Python code

## Conclusion

All implementations are **fair, optimized, and produce identical results**. The performance differences reflect platform-specific optimizations rather than algorithm differences:

- **WASM**: C++ and Rust are very close (144ms vs 152ms, only 5% difference) due to LLVM optimizations
- **Backend**: C++ is fastest (504ms), Rust is very close (614ms, 22% difference), Python (Cython) is good (706ms, 40% slower)
- **Binary Protocol**: Critical optimization that eliminated JSON overhead and made all backends much faster

The binary protocol optimization was the key breakthrough - it eliminated ~369ms of JSON serialization overhead and made C++ BE competitive with Rust BE. All backends now use the same optimized binary protocol, making the comparison fair and the performance differences minimal.
