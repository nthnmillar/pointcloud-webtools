# Voxel Downsampling Benchmark Results

## Overview

Voxel downsampling reduces point cloud density by averaging points within voxel grid cells. This is a **HashMap-heavy algorithm** - performance depends heavily on hash map operations for grouping points by voxel coordinates.

## Algorithm Characteristics

- **Type**: HashMap-heavy (grouping and averaging operations)
- **Complexity**: O(n) where n is the number of points
- **Key Operations**:
  - HashMap insertions/lookups for voxel grouping
  - Averaging calculations per voxel
- **Data Structure**: HashMap/Set for voxel coordinate tracking

See [Benchmark Methodology](benchmark.md) for general implementation details.

## Benchmark Results

### Test Dataset: 1M Points

- **Voxel Size**: 2.0
- **Original Points**: 1,000,000
- **Downsampled Points**: ~25,942 (expected across all implementations)

### Performance (Processing Time)

| Implementation              | Time (ms) | Relative Speed | Notes                                  |
| --------------------------- | --------- | -------------- | -------------------------------------- |
| **TypeScript**              | 207 ms    | 1.45x          | Good performance, pure JS              |
| **C++ WASM Main**           | 143 ms    | 1.0x           | Fastest WASM implementation            |
| **Rust WASM Main**          | 154 ms    | 1.08x          | Very close to C++ WASM (8% difference) |
| **C++ WASM Worker**         | 189 ms    | 1.32x          | Good performance with worker overhead  |
| **Rust WASM Worker**        | 196 ms    | 1.37x          | Best for browser (non-blocking)        |
| **C++ Backend**             | 476 ms    | Baseline       | Fastest backend                        |
| **Rust Backend**            | 618 ms    | 1.30x          | Very close to C++ BE (30% difference)  |
| **Python Backend (Cython)** | 697 ms    | 1.46x          | Compiled Python, good performance      |

### Performance Analysis

#### Browser Performance (WASM)

- **C++ WASM Main** (143ms) is fastest, **Rust WASM Main** (154ms) is 8% slower
- Both use LLVM-based compilers (Emscripten for C++, rustc for Rust), so performance is very close
- The small gap reflects hash map implementation differences, but LLVM optimizations minimize the difference
- **Worker overhead**: ~30-50ms for both implementations

#### Backend Performance

- **C++ Backend** (476ms) is **30% faster** than Rust Backend (618ms)
- **Key Finding**: C++ BE's `std::unordered_map` with `FastHash` performs better than Rust's `FxHashMap` for this HashMap-heavy workload
- **Python Backend (Cython)** (697ms) is **46% slower** than C++ BE
  - Compiled Python code but Python dict operations remain the bottleneck
  - Cython optimizes numeric operations but can't fully optimize dict operations
- **Why Backend is Slower than WASM**: Backend is 2-3x slower than WASM (476ms vs 143ms) due to **WebSocket network I/O overhead**. This algorithm is very fast (HashMap operations are highly optimized), so the ~50-100ms WebSocket overhead (binary protocol + process communication) becomes a significant percentage of total time. For fast algorithms, network overhead dominates; for slower compute-intensive algorithms (like point smoothing), the overhead becomes negligible relative to computation time.

**Why C++ BE is Fastest Among Backends for This Algorithm**:

- HashMap-heavy operations favor C++'s optimized hash map implementation
- C++'s `std::unordered_map` with `FastHash` is well-optimized for integer keys

### Accuracy Verification

All implementations produce **identical results**:

- ✅ Same downsampled point count (±1% variance due to input differences)
- ✅ Same voxel count
- ✅ Same point positions (within floating-point precision)

## Test-Specific Optimizations

### Binary Protocol Impact

The switch from HTTP/JSON to WebSocket/binary protocol was critical:

- **Eliminated ~369ms of JSON overhead** for 1M points
- **Reduced C++ BE from ~1,549ms to ~476ms** (3.3x faster!)
- All backends now use zero-copy binary I/O

### HashMap Implementation Details

- **C++**: `std::unordered_map` with `FastHash` (optimized for integer keys)
- **Rust**: `FxHashMap` (rustc-hash) - also optimized for integer keys
- **Python**: Python dict (Cython compiled but still uses Python C API)

The performance difference reflects hash map implementation efficiency for integer-key workloads.

## Recommendations

### Browser (WASM)

- **C++ WASM Main** (143ms) - Fastest, use if UI blocking is acceptable
- **Rust WASM Worker** (196ms) - Best for non-blocking processing
- **TypeScript** (207ms) - Good performance, simpler code

### Backend

- **C++ Backend** (476ms) - Fastest among backends for this HashMap-heavy algorithm
- **Rust Backend** (618ms) - Good alternative, 30% slower
- **Python Cython** (697ms) - Acceptable if team prefers Python ecosystem

## Key Findings

1. **WASM implementations are fastest overall** (143-196ms) - 2-3x faster than backend
2. **C++ Backend is fastest among backends** (476ms vs 618ms for Rust) for this HashMap-heavy algorithm
3. **WASM performance is very close** (8% difference) due to LLVM compiler optimizations
4. **Binary protocol was critical** - eliminated ~369ms of JSON overhead
5. **Python Cython is 46% slower** but provides Python ecosystem benefits

## Conclusion

For voxel downsampling (HashMap-heavy algorithm), **WASM implementations provide the best overall performance** (143-196ms) and are 2-3x faster than backend (476-697ms). Among backend implementations, **C++ Backend is fastest** (476ms). WASM implementations are very close, making either C++ or Rust WASM suitable for browser-based processing. All implementations produce identical results and are fully optimized.
