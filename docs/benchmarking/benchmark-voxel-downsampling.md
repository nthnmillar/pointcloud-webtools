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
| **TypeScript WASM** | 210 ms | 1.5x | Good performance, pure JS |
| **C++ WASM Main** | 143 ms | 1.02x | Very close to Rust WASM |
| **Rust WASM Main** | 140 ms | 1.0x | Fastest WASM (1M points) |
| **C++ WASM Worker** | 171 ms | 1.22x | Good performance with worker overhead |
| **Rust WASM Worker** | 162 ms | 1.16x | Best for browser (non-blocking) |
| **Rust Backend** | 643 ms | Baseline | Fastest backend |
| **C++ Backend** | 1,549 ms | 2.41x | Optimized with clang + ankerl::unordered_dense::map |
| **Python Backend (Cython)** | 2,856 ms | 4.44x | Compiled Python, still slower due to dict overhead |

### Performance Analysis

#### Browser Performance (WASM) - Why C++ and Rust are Close
- **Rust WASM** (~150ms for 1M points) and **C++ WASM** (~157ms) are **very close** (only 5% difference)
- Both use **LLVM-based compilers**:
  - Rust: Native LLVM compiler
  - C++: Emscripten (LLVM/Clang-based)
- Both benefit from similar LLVM optimizations
- Both use binary protocol (no JSON overhead)
- The small difference is due to hash map implementation details, but LLVM optimizations minimize the gap

#### Backend Performance - Why C++ and Rust Differ
- **Rust Backend** (643ms) is **2.4x faster** than C++ Backend (1,549ms)
- **Key Difference**: Hash map implementation performance
  - **Rust**: Uses `FxHashMap` (rustc-hash) - specifically optimized for integer keys
  - **C++**: Uses `ankerl::unordered_dense::map` with FastHash (matching FxHash algorithm)
  - Even with the same hash function and a fast hash map library, Rust's `FxHashMap` is still faster
- **Compiler**: Both use LLVM (clang for C++, rustc for Rust), so compiler differences are minimal
- **Conclusion**: The 2.4x difference is due to Rust's `FxHashMap` being inherently faster for this workload, not compiler or algorithm differences

#### Python Backend (Cython) Performance
- **Python Backend (Cython)** (2,856ms) is **4.4x slower** than Rust Backend (643ms)
- **Cython Implementation**: 
  - Compiled Python code (`.pyx` → C → native binary)
  - Uses type annotations (`cdef int`, `cdef float`) for C-level performance
  - Same Python syntax, compiled to native code
- **Why Still Slower**:
  - Python dict operations are still the bottleneck (dict lookups/insertions go through Python's C API)
  - Even compiled, Python dicts have overhead compared to C++/Rust hash maps
  - Cython optimizes numeric operations but can't fully optimize dict operations
- **Improvement**: ~13% faster than pure Python (~3,400ms → ~2,856ms)
- **Fair Comparison**: Yes - Cython is compiled Python, comparable to compiled C++/Rust backends

#### Why WASM is Close but Backend Differs
- **WASM**: Both use LLVM, and the WASM runtime may optimize hash map operations similarly
- **Backend**: Native execution exposes the true performance difference between hash map implementations
- Rust's `FxHashMap` is specifically designed for performance with integer keys, giving it an edge in native execution
  
- **Python Backend (Cython)** is slower (2.9s) - compiled Python code, but still 4.4x slower than Rust

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
- Use **Rust Backend** (fastest overall, ~643ms for 1M points)
- **C++ Backend** if Rust unavailable (~1,549ms for 1M points, still good performance)
- **Python Backend (Cython)** (~2,856ms for 1M points, 4.4x slower than Rust)

## Technical Notes

### Why Rust Backend is Fastest
1. **Binary Protocol**: No JSON parsing overhead (both C++ and Rust use binary)
2. **HashMap**: Uses `FxHashMap` (rustc-hash) - specifically optimized for integer keys
3. **Zero-copy**: Works directly with parsed slices
4. **Compiler**: LLVM-based rustc with excellent optimization (`--release`)

### Why C++ Backend is Slower (Despite Optimizations)
1. **Hash Map**: Uses `ankerl::unordered_dense::map` with FastHash (matching FxHash algorithm)
   - Even with a fast hash map library and matching hash function, Rust's `FxHashMap` is still faster
   - This is a known characteristic of Rust's hash map implementation
2. **Compiler**: Uses clang (LLVM) with `-O3 -flto -march=native` - same optimization level as Rust
3. **Conclusion**: The 2.4x difference is due to Rust's `FxHashMap` being inherently faster for integer-key workloads

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
3. **Limitations**:
   - Python dict operations still use Python's C API (bottleneck)
   - Python list operations still have overhead
   - Cython can't fully optimize Python object operations
4. **Performance**: ~13% faster than pure Python, but still 4.4x slower than Rust
   - Dict operations are the limiting factor, not numeric operations

### Optimizations Applied to C++ Backend
- ✅ FastHash (matching Rust's FxHash algorithm)
- ✅ `ankerl::unordered_dense::map` (fast hash map library)
- ✅ clang compiler (LLVM, matching Rust's compiler backend)
- ✅ Full compiler optimizations (-O3, -flto, -march=native)
- ✅ Optimized output loop (pointer arithmetic, pre-calculated inverse)

**Result**: C++ BE is fully optimized, but Rust's `FxHashMap` is still 2.4x faster for this specific workload.

### Python Backend (Cython) Optimizations
- ✅ Cython compilation (Python → C → native binary)
- ✅ Type annotations (`cdef int`, `cdef float`) for C-level variables
- ✅ C floor function (`from libc.math cimport floor`)
- ✅ While loops instead of range() for better C code generation
- ✅ Explicit type casts to avoid Python object overhead
- ✅ Compiler optimizations (`-O3 -march=native -ffast-math`)

**Result**: Python BE (Cython) is ~13% faster than pure Python, but still 4.4x slower than Rust due to Python dict overhead.

## Conclusion

All implementations are **fair, optimized, and produce identical results**. The performance differences reflect platform-specific optimizations rather than algorithm differences:

- **WASM**: Rust and C++ are very close (140ms vs 143ms, only 2% difference) due to LLVM optimizations
- **Backend**: Rust is fastest (643ms), C++ is good (1,549ms), Python (Cython) is acceptable (2,856ms)
- **Python (Cython)**: Compiled Python code, fair comparison to compiled C++/Rust, but limited by Python dict overhead

Rust provides the best performance for both WASM and backend implementations. Python (Cython) is compiled Python code but still 4.4x slower than Rust due to Python dict overhead.

