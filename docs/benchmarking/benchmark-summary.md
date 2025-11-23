# Benchmark Summary

## Executive Summary

### Test Results Overview

**Three algorithms tested**: Voxel Downsampling (1M points), Voxel Debug (1M points), Point Smoothing (200K points)

**Fastest overall by test**:
- **Voxel Downsampling**: C++ WASM Main (143ms)
- **Voxel Debug**: C++ WASM Main (136ms)
- **Point Smoothing**: C++ Backend (541ms)

**Performance summary**:
- WASM is fastest overall for 2 out of 3 tests
- C++ Backend is fastest overall for point smoothing
- Among backends, C++ Backend is fastest for all three algorithms
- Rust Backend is typically 30-48% slower than C++ Backend
- TypeScript is 1.45-1.53x slower for voxel operations, but 4.0x slower for point smoothing
- Python Cython is 46-330% slower than C++/Rust

## Test Results

### WASM Performance

| Tool | Fastest WASM | C++ vs Rust Gap |
|------|-------------|-----------------|
| **Voxel Downsampling** | C++ WASM Main (143ms) | Rust 8% slower (154ms) |
| **Voxel Debug** | C++ WASM Main (136ms) | Rust 13% slower (154ms) |
| **Point Smoothing** | Rust WASM Main (577ms) | C++ 19% slower (686ms) |

### Backend Performance

| Tool | Fastest Backend | Performance Ranking |
|------|----------------|---------------------|
| **Voxel Downsampling** | C++ BE (476ms) | C++ > Rust (618ms, 30% slower) > Python Cython (697ms, 46% slower) |
| **Voxel Debug** | C++ BE (419ms) | C++ > Python Cython (670ms) ≈ Rust (673ms) |
| **Point Smoothing** | C++ BE (541ms) | C++ > Rust (799ms, 48% slower) > Python Cython (2306ms, 4.26x slower) |

### WASM vs Backend Comparison

| Tool | Fastest Overall | WASM vs Backend |
|------|----------------|-----------------|
| **Voxel Downsampling** | C++ WASM Main (143ms) | WASM 2-3x faster than backend |
| **Voxel Debug** | C++ WASM Main (136ms) | WASM 3-5x faster than backend |
| **Point Smoothing** | C++ Backend (541ms) | Backend 7% faster than WASM |

### TypeScript Performance

| Tool | TypeScript vs Fastest | Gap |
|------|----------------------|-----|
| **Voxel Downsampling** | 207ms vs 143ms | 1.45x slower |
| **Voxel Debug** | 208ms vs 136ms | 1.53x slower |
| **Point Smoothing** | 2165ms vs 541ms | **4.0x slower** |

### Worker Overhead

- **Small datasets** (< 10K points): ~20-30ms overhead
- **Large datasets** (> 100K points): ~100-110ms overhead (point smoothing)

## Interpretation & Insights

### 1. Algorithm Type Determines Performance Patterns

**HashMap/Set-based algorithms** (voxel downsampling, voxel debug):
- WASM is 2-5x faster than backend
- Performance difference likely due to network I/O overhead being significant relative to computation time
- C++ WASM slightly faster than Rust WASM (8-13% difference)

**Grid-based algorithms** (point smoothing):
- Backend is faster than WASM (7% faster for C++ BE vs fastest WASM)
- More compute-intensive per point, making backend processing efficiency more significant
- Rust WASM faster than C++ WASM (19% difference)
- **TypeScript is substantially slower**: 4.0x slower than fastest (2165ms vs 541ms), compared to only 1.45-1.53x slower for HashMap/Set-based algorithms

**Why**: Algorithm data structures and memory access patterns significantly impact performance differences between languages and platforms.

### 2. Language Performance Within Platforms

**WASM**: Rust and C++ are very close (8-19% difference) because both use LLVM-based compilers (Emscripten for C++, rustc for Rust). The small gaps reflect implementation differences, but LLVM optimizations minimize the difference.

**Backend**: C++ Backend is fastest for all three algorithms. Rust Backend is competitive but typically 30-48% slower. The performance gap varies by algorithm:
- HashMap-heavy: C++ ~30% faster (favors `std::unordered_map` with `FastHash`)
- Grid-based: C++ ~48% faster (optimized grid structure and cache locality)
- Set-based: C++ ~60% faster (optimized HashSet performance)

### 3. TypeScript Performance Gap

TypeScript shows the largest performance gap in point smoothing (4.0x slower) compared to other tests (1.45-1.53x slower). This suggests that grid-based algorithms with intensive neighbor searches are particularly challenging for JavaScript's JIT compiler compared to HashMap or Set-based operations.

### 4. Binary Protocol Impact

All backend implementations use WebSocket with binary protocol instead of HTTP/JSON:
- Eliminated ~369ms of JSON overhead for 1M points
- Zero-copy data transfer between Node.js and native processes
- Made all backends significantly faster and fair to compare

## Recommendations

### Browser-Based Processing (WASM)

| Dataset Size | Recommended | Notes |
|--------------|-------------|-------|
| **Small** (< 10K points) | C++ or Rust WASM Worker or TypeScript | Worker overhead noticeable, TypeScript competitive |
| **Medium** (10K - 1M points) | C++ or Rust WASM Worker | Best performance, non-blocking (C++ faster for voxel ops, Rust faster for point smoothing) |
| **Large** (1M - 10M points) | C++ or Rust WASM Worker or Backend | WASM still viable, backend becomes competitive |
| **Very Large** (10M - 100M points) | Backend recommended | WASM memory constraints become limiting |
| **Extreme** (100M - 1B+ points) | Backend required | Browser memory limits exceeded |

**Note**: Always use Web Workers for WASM to avoid UI blocking.

### Server-Side Processing (Backend)

| Requirement | Recommended | Why |
|-------------|-------------|-----|
| **Voxel Downsampling** | C++ Backend | Fastest (476ms for 1M points) |
| **Point Smoothing** | C++ Backend | Fastest (541ms for 200K points) |
| **Voxel Debug** | C++ Backend | Fastest (419ms for 1M points) |
| **Team Expertise** | Match team preference | C++ and Rust both excellent |
| **Python Ecosystem** | Python Cython | 46-330% slower but readable |

### Practical Guidance

1. **Default browser choice**: C++ or Rust WASM Worker
   - C++ WASM Worker: Faster for voxel downsampling (189ms) and voxel debug (164ms)
   - Rust WASM Worker: Faster for point smoothing (677ms)
   - Performance differences are small (8-19% between C++ and Rust WASM)

2. **Backend choice**: C++ Backend is fastest among backends for all algorithms. Rust Backend is competitive (30-48% slower).

3. **Python (Cython)**: 46-330% slower than C++/Rust but provides Python ecosystem benefits.

4. **Hybrid approach**: Use WASM for interactive previews on downsampled data, backend for full processing of large datasets.

## Conclusion

These benchmarks demonstrate that algorithm characteristics significantly impact performance differences between languages and platforms. WASM is faster overall for HashMap/Set-based algorithms (voxel downsampling, voxel debug), while backend is faster for compute-intensive grid-based algorithms (point smoothing). Among backend implementations, C++ Backend is fastest for all tested algorithms, with Rust Backend being competitive (30-48% slower).

TypeScript shows the largest performance gap for point smoothing (4.0x slower), indicating grid-based algorithms with intensive neighbor searches are particularly challenging for JavaScript's JIT compiler. For very large datasets (100M-1B+ points), backend is required due to browser memory constraints.

All implementations are **fair, optimized, and produce identical results**. The performance differences reflect real platform characteristics, making these benchmarks valuable for informed technology choices.

## See Also

- [Voxel Downsampling Benchmark](benchmark-voxel-downsampling.md) - Detailed analysis
- [Voxel Debug Benchmark](benchmark-voxel-debug.md) - Visualization performance
- [Point Cloud Smoothing Benchmark](benchmark-point-smoothing.md) - Smoothing performance
