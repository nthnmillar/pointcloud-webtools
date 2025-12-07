# Benchmark Summary

## Executive Summary

### Test Results Overview

**Three algorithms tested**: Voxel Downsampling (1M points), Voxel Debug (1M points), Point Smoothing (200K points)

**Fastest overall by test**:

- **Voxel Downsampling**: C++ WASM Main (143ms)
- **Voxel Debug**: C++ WASM Main (136ms)
- **Point Smoothing**: C++ Backend (541ms)

## Test Results

### WASM Performance

| Tool                   | Fastest WASM           | C++ vs Rust Gap         |
| ---------------------- | ---------------------- | ----------------------- |
| **Voxel Downsampling** | C++ WASM Main (143ms)  | Rust 8% slower (154ms)  |
| **Voxel Debug**        | C++ WASM Main (136ms)  | Rust 13% slower (154ms) |
| **Point Smoothing**    | Rust WASM Main (577ms) | C++ 19% slower (686ms)  |

### Backend Performance

| Tool                   | Fastest Backend | Performance Ranking                                                   |
| ---------------------- | --------------- | --------------------------------------------------------------------- |
| **Voxel Downsampling** | C++ BE (476ms)  | C++ > Rust (618ms, 30% slower) > Python Cython (697ms, 46% slower)    |
| **Voxel Debug**        | C++ BE (419ms)  | C++ > Python Cython (670ms) ≈ Rust (673ms)                            |
| **Point Smoothing**    | C++ BE (541ms)  | C++ > Rust (799ms, 48% slower) > Python Cython (2306ms, 4.26x slower) |

### WASM vs Backend Comparison

| Tool                   | Fastest Overall       | WASM vs Backend               |
| ---------------------- | --------------------- | ----------------------------- |
| **Voxel Downsampling** | C++ WASM Main (143ms) | WASM 2-3x faster than backend |
| **Voxel Debug**        | C++ WASM Main (136ms) | WASM 3-5x faster than backend |
| **Point Smoothing**    | C++ Backend (541ms)   | Backend 7% faster than WASM   |

### TypeScript Performance

| Tool                   | TypeScript vs Fastest | Gap             |
| ---------------------- | --------------------- | --------------- |
| **Voxel Downsampling** | 207ms vs 143ms        | 1.45x slower    |
| **Voxel Debug**        | 208ms vs 136ms        | 1.53x slower    |
| **Point Smoothing**    | 2165ms vs 541ms       | **4.0x slower** |

### Worker Overhead

- **Small datasets** (< 10K points): ~20-30ms overhead
- **Large datasets** (> 100K points): ~100-110ms overhead (point smoothing)

## Key Insights

### Algorithm Type Determines Performance Patterns

**Why WASM vs Backend Performance Differs**:

- **Voxel operations (downsampling, debug)**: WASM is 2-5x faster because these algorithms are fast (optimized HashMap/Set operations). WebSocket overhead (~50-100ms) becomes significant when computation is fast (143-207ms). For fast algorithms, network overhead dominates.

- **Point smoothing**: Backend is 7% faster because this algorithm is compute-intensive (grid-based neighbor searches). The same WebSocket overhead (~50-100ms) becomes negligible when computation takes longer (541ms). For slower algorithms, backend processing efficiency outweighs network overhead.

**Key Insight**: WebSocket overhead is similar across all tests (~50-100ms), but its impact depends on computation time. Fast algorithms → overhead is significant → WASM wins. Slow algorithms → overhead is negligible → backend wins.

### Language Performance

**WASM**: Rust and C++ are very close (8-19% difference) due to LLVM-based compilers. Small gaps reflect implementation differences.

**Backend**: C++ Backend is fastest for all algorithms. Rust Backend is competitive (30-48% slower). Performance gap varies by algorithm type:

- HashMap-heavy: C++ ~30% faster (favors `std::unordered_map` with `FastHash`)
- Grid-based: C++ ~48% faster (optimized grid structure and cache locality)
- Set-based: C++ ~60% faster (optimized HashSet performance)

**TypeScript**: Shows largest gap in point smoothing (4.0x slower) compared to voxel operations (1.45-1.53x slower), indicating grid-based algorithms with intensive neighbor searches are challenging for JavaScript's JIT compiler.

## Recommendations

### Browser-Based Processing (WASM)

| Dataset Size                       | Recommended                           | Notes                                                                                      |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Small** (< 10K points)           | C++ or Rust WASM Worker or TypeScript | Worker overhead noticeable, TypeScript competitive                                         |
| **Medium** (10K - 1M points)       | C++ or Rust WASM Worker               | Best performance, non-blocking (C++ faster for voxel ops, Rust faster for point smoothing) |
| **Large** (1M - 10M points)        | C++ or Rust WASM Worker or Backend    | WASM still viable, backend becomes competitive                                             |
| **Very Large** (10M - 100M points) | Backend recommended                   | WASM memory constraints become limiting                                                    |
| **Extreme** (100M - 1B+ points)    | Backend required                      | Browser memory limits exceeded                                                             |

**Note**: Always use Web Workers for WASM to avoid UI blocking.

### Server-Side Processing (Backend)

| Requirement            | Recommended           | Why                             |
| ---------------------- | --------------------- | ------------------------------- |
| **Voxel Downsampling** | C++ Backend           | Fastest (476ms for 1M points)   |
| **Point Smoothing**    | C++ Backend           | Fastest (541ms for 200K points) |
| **Voxel Debug**        | C++ Backend           | Fastest (419ms for 1M points)   |
| **Team Expertise**     | Match team preference | C++ and Rust both excellent     |
| **Python Ecosystem**   | Python Cython         | 46-330% slower but readable     |

### Quick Recommendations

- **Browser default**: C++ or Rust WASM Worker (C++ faster for voxel ops, Rust faster for point smoothing; differences are small 8-19%)
- **Backend default**: C++ Backend (fastest for all algorithms; Rust is competitive 30-48% slower)
- **Python**: 46-330% slower but provides ecosystem benefits
- **Hybrid**: Use WASM for interactive previews, backend for full processing of large datasets

## Conclusion

Algorithm characteristics significantly impact performance differences between languages and platforms. WASM is faster for HashMap/Set-based algorithms (voxel downsampling, voxel debug), while backend is faster for compute-intensive grid-based algorithms (point smoothing). C++ Backend is fastest among backends for all tested algorithms, with Rust Backend being competitive (30-48% slower).

For very large datasets (100M-1B+ points), backend is required due to browser memory constraints. All implementations are **fair, optimized, and produce identical results**.

## See Also

- [Voxel Downsampling Benchmark](benchmark-voxel-downsampling.md) - Detailed analysis
- [Voxel Debug Benchmark](benchmark-voxel-debug.md) - Visualization performance
- [Point Cloud Smoothing Benchmark](benchmark-point-smoothing.md) - Smoothing performance
