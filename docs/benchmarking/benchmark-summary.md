# Benchmark Summary

## Executive Summary

**Key Finding**: Performance differences between languages depend on algorithm characteristics - HashMap-heavy algorithms favor Rust, while grid-based algorithms show better parity between Rust and C++.

## Main Findings

### 1. Algorithm Characteristics Determine Performance Gaps

| Algorithm Type | Rust vs C++ Backend | Reason |
|----------------|---------------------|--------|
| **HashMap-heavy** (voxel downsampling) | C++ ~30% faster | HashMap operations favor C++'s `std::unordered_map` with `FastHash` |
| **Grid-based** (point smoothing) | C++ ~48% faster | C++ BE optimized grid structure and memory access patterns |
| **Set-based** (voxel debug) | C++ ~60% faster | C++ BE optimized HashSet performance |

**Critical Insight**: The performance difference between languages varies significantly based on algorithm data structures and memory access patterns.

### 2. WASM Performance: Rust and C++ Are Very Close

| Tool | Fastest WASM | Performance Gap |
|------|-------------|-----------------|
| **Voxel Downsampling** | C++ WASM Main (143ms) | Rust 8% slower (154ms) |
| **Voxel Debug** | C++ WASM Main (136ms) | Rust 13% slower (154ms) |
| **Point Smoothing** | Rust WASM Main (577ms) | C++ 19% slower (686ms) |

**Key Insight**: Both use LLVM-based compilers (Emscripten for C++, rustc for Rust), so WASM performance is typically very close (8-19% difference).

### 3. Backend Performance: Algorithm-Dependent

| Tool | Fastest Backend | Performance Ranking |
|------|----------------|---------------------|
| **Voxel Downsampling** | C++ BE (476ms) | C++ > Rust (618ms, 30% slower) > Python Cython (697ms, 46% slower) |
| **Point Smoothing** | C++ BE (541ms) | C++ > Rust (799ms, 48% slower) > Python Cython (2306ms, 4.3x slower) |
| **Voxel Debug** | C++ BE (419ms) | C++ > Python Cython (670ms) ≈ Rust (673ms) |

**Key Insight**: C++ Backend is fastest for all three algorithms, with Rust Backend typically 30-48% slower but still competitive.

### 4. Binary Protocol Optimization Was Critical

All backend implementations now use **WebSocket with binary protocol** instead of HTTP/JSON:
- **Eliminated JSON serialization overhead** (~369ms saved for 1M points)
- **Zero-copy data transfer** between Node.js and native processes
- Made all backends significantly faster and fair to compare

## Platform Recommendations

### Browser-Based Processing (WASM)

| Dataset Size | Recommended | Performance |
|--------------|-------------|------------|
| **Small** (< 10K points) | Rust WASM Worker or TypeScript | Fast, no server load |
| **Medium** (10K - 100K points) | Rust WASM Worker | Best performance, non-blocking |
| **Large** (> 100K points) | Rust WASM Worker or Backend | Consider backend for server resources |

**Note**: Always use Web Workers for WASM to avoid UI blocking.

### Server-Side Processing (Backend)

| Requirement | Recommended | Why |
|-------------|-------------|-----|
| **Voxel Downsampling** | C++ Backend | Fastest (476ms for 1M points) |
| **Point Smoothing** | C++ Backend | Fastest (541ms for 200K points) |
| **Voxel Debug** | C++ Backend | Fastest (419ms for 1M points) |
| **Team Expertise** | Match team preference | C++ and Rust both excellent |
| **Python Ecosystem** | Python Cython | 46-244% slower but readable |

## Key Technical Insights

### 1. WASM Performance Parity
- **Rust and C++ WASM are very close** (typically 8-19% difference) because both use LLVM-based compilers
- **Point smoothing**: Rust WASM Main (577ms) is 19% faster than C++ WASM Main (686ms)

### 2. Backend Performance
- **C++ BE is fastest** for all three algorithms (voxel downsampling, point smoothing, voxel debug)
- **Rust BE**: Competitive performance, typically 30-48% slower than C++ BE
- **Python Cython**: 46-330% slower but provides Python ecosystem benefits

### 3. Binary Protocol Was Critical
- **Eliminated ~369ms of JSON overhead** for 1M points
- **Zero-copy data transfer** via WebSocket binary protocol
- **Made all backends competitive** and fair to compare

### 4. Worker Overhead
- **Small datasets** (< 10K points): Noticeable overhead (~20-30ms)
- **Large datasets** (> 100K points): Negligible overhead
- **Always use workers** for large datasets to avoid UI blocking

## Practical Takeaways

### For Point Cloud Processing Projects

1. **Default Choice: Rust WASM Worker**
   - Best overall browser performance
   - Non-blocking UI
   - Consistent across all tools

2. **Backend: Choose by Algorithm**
   - **All operations**: C++ Backend (fastest for all algorithms)
   - **Team preference**: Both C++ and Rust are excellent, Rust is typically 30-48% slower

3. **Python (Cython)**
   - Compiled Python code (fair comparison)
   - 46-244% slower than C++/Rust
   - Good if team prefers Python ecosystem

4. **WASM vs Backend**
   - **WASM**: Use for real-time, interactive processing
   - **Backend**: Use for large datasets or server-side processing
   - **Hybrid**: Best of both worlds

## Conclusion

These benchmarks demonstrate that:

1. **Algorithm characteristics** significantly impact performance differences between languages
2. **C++ Backend is fastest** for all tested algorithms, with Rust Backend being competitive (30-48% slower)
3. **WASM generally performed best** in these tests with similar point cloud counts (typically 2-5x faster than backend)
4. **WASM limitations for very large datasets**: Point clouds around 1 billion points may be too much for WASM to handle due to:
   - Browser memory constraints (typically 2-4GB limit)
   - JavaScript heap size limitations
   - WebAssembly memory allocation overhead
   - Browser tab stability concerns with massive allocations
5. **WASM is suitable for**: Smaller point clouds (< 10M points) or performance previews on downsampled data
6. **Backend is suitable for**: Very large point clouds (100M-1B+ points) where server resources and memory are available
7. **Binary protocol optimization** was critical for fair backend comparisons

All implementations are **fair, optimized, and produce identical results**. The performance differences reflect real platform characteristics, making these benchmarks valuable for informed technology choices.

## See Also

- [Voxel Downsampling Benchmark](benchmark-voxel-downsampling.md) - Detailed analysis
- [Voxel Debug Benchmark](benchmark-voxel-debug.md) - Visualization performance
- [Point Cloud Smoothing Benchmark](benchmark-point-smoothing.md) - Smoothing performance

