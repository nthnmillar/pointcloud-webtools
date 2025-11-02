# Benchmark Summary

## Executive Summary

This project provides comprehensive benchmarks comparing point cloud processing tools across multiple languages (TypeScript, C++, Rust, Python) and execution environments (browser WASM, backend servers). All implementations use **identical algorithms** to ensure fair, accurate performance comparisons.

## Overall Performance Findings

### Browser Performance (WASM)
| Tool | Fastest | Notes |
|------|---------|-------|
| **Voxel Downsampling** | Rust WASM (~1-2ms) | 2x faster than C++ WASM |
| **Voxel Debug** | Rust WASM (~1ms) | Best for visualization |
| **Point Smoothing** | Rust WASM Worker (~29ms) | Fastest overall |

**Key Insight**: Rust WASM consistently outperforms C++ WASM due to optimized bindings and compiler optimizations.

### Backend Performance
| Tool | Fastest | C++ vs Rust | Notes |
|------|---------|-------------|-------|
| **Voxel Downsampling** | Rust BE (~1,700ms) | C++ ~2x slower | HashMap-heavy algorithm |
| **Point Smoothing** | Rust BE (~57ms) | Nearly equal (~60ms) | Grid-based algorithm |
| **Python BE** | - | 18-36x slower | Readable but slow |

**Key Insight**: Performance parity depends on algorithm characteristics:
- **HashMap-heavy algorithms** (voxel downsampling): Rust significantly faster (2x)
- **Grid-based algorithms** (point smoothing): Rust and C++ nearly equivalent

## Detailed Tool Comparisons

### Voxel Downsampling

**Algorithm**: Grid-based averaging with HashMap for voxel grouping

**Performance Highlights**:
- **WASM**: Rust 2x faster than C++ (~1-2ms vs ~3-6ms)
- **Backend**: Rust 2x faster than C++ (~1,700ms vs ~3,700ms)
- **Root Cause**: Rust's optimized HashMap (FxHash) vs C++'s std::unordered_map

**Why C++ is Slower**:
- `std::unordered_map` overhead (less optimized than Rust's HashMap)
- HashMap is the bottleneck (every point needs lookup)

**Best Choice**:
- Browser: Rust WASM Worker
- Backend: Rust BE (fastest), C++ BE (good alternative)

### Point Cloud Smoothing

**Algorithm**: O(n) spatial hashing with grid-based neighbor search

**Performance Highlights**:
- **WASM**: Rust fastest (~29ms), C++ good (~36-55ms)
- **Backend**: Rust and C++ nearly equal (~57ms vs ~60ms)
- **Worker Overhead**: Visible on small datasets (~19ms), negligible on large

**Why Better Parity**:
- Grid-based indexing (array access) vs HashMap-heavy
- Both languages optimize grid operations equally well
- Less dependency on standard library HashMap performance

**Best Choice**:
- Browser: Rust WASM Worker (small-medium datasets)
- Backend: Rust or C++ (both excellent, choose by team preference)

### Voxel Debug Visualization

**Algorithm**: Unique voxel center generation

**Performance Highlights**:
- **WASM**: Rust fastest (~1ms), TypeScript good (~1-3ms)
- **Note**: Typically browser-only tool (backend less relevant)

**Best Choice**: Rust WASM Worker for best performance

## Algorithm Characteristics Matter

### Critical Finding: Performance Gaps are Algorithm-Dependent

The performance difference between C++ and Rust backends varies significantly based on algorithm characteristics:

| Algorithm Type | Rust vs C++ | Reason |
|----------------|-------------|--------|
| **HashMap-heavy** (voxel downsampling) | Rust 2x faster | HashMap is the bottleneck; Rust's FxHash is superior |
| **Grid-based** (point smoothing) | Nearly equal | Array indexing is equally efficient in both |

**Implication**: When choosing between Rust and C++, consider:
- **Use Rust** for HashMap/dictionary-heavy workloads
- **Use C++ or Rust** for grid/array-based workloads (either works well)

## Platform Recommendations

### For Browser-Based Processing

| Dataset Size | Recommended | Why |
|--------------|-------------|-----|
| **Small** (< 10K points) | Rust WASM Worker or TypeScript | Fast, no server load |
| **Medium** (10K - 100K points) | Rust WASM Worker | Best performance, non-blocking |
| **Large** (> 100K points) | Rust WASM Worker or Backend | Consider backend for server resources |

**Note**: Always use Web Workers for WASM to avoid UI blocking.

### For Server-Side Processing

| Requirement | Recommended | Why |
|-------------|-------------|-----|
| **Fastest Performance** | Rust Backend | Consistently fastest |
| **HashMap-Heavy Workloads** | Rust Backend | 2x faster than C++ |
| **Grid-Based Workloads** | Rust or C++ Backend | Either works (nearly equal) |
| **Team Expertise** | Match team preference | C++ is good if team knows it |
| **Readability/Prototyping** | Python Backend | Slower but highly readable |

## Key Technical Insights

### 1. WASM Performance
- **Rust WASM** consistently fastest due to:
  - Optimized wasm-bindgen bindings
  - Better compiler optimizations
  - Efficient memory access patterns

### 2. Backend Performance Parity
- **HashMap-heavy**: Rust's advantage is significant (2x)
- **Grid-based**: Nearly equivalent performance
- **Python**: Always slowest (18-36x) but most readable

### 3. Worker Overhead
- **Small datasets** (< 10K points): Noticeable overhead (~19ms)
- **Large datasets** (> 100K points): Negligible overhead
- **Always use workers** for large datasets to avoid UI blocking

### 4. Optimization Strategies
All implementations use:
- Pre-calculated inverses (multiplication vs division)
- Chunked processing for cache locality
- Pre-allocated data structures
- Platform-specific optimizations (RapidJSON, serde_json, etc.)

## Methodology Quality

### Fair Comparison Criteria
1. ✅ **Algorithm Consistency**: Identical algorithms across all implementations
2. ✅ **Optimization Level**: Each optimized for its platform
3. ✅ **Result Verification**: All produce identical outputs
4. ✅ **Accurate Timing**: Internal measurement (excludes I/O)

### What Makes This Valid
- **Same Input**: All implementations process identical datasets
- **Same Output**: Verified identical results (voxel counts, point positions)
- **Same Algorithm**: Core logic is identical; only platform optimizations differ
- **Real-World Optimizations**: Uses best practices for each language

## Practical Takeaways

### For Point Cloud Processing Projects

1. **Default Choice: Rust**
   - Best performance-to-maintainability ratio
   - Fastest in both WASM and backend
   - Consistent across all tools

2. **C++ is Viable**
   - Good performance (especially grid-based algorithms)
   - Use if team expertise favors C++
   - Consider flat hash maps for HashMap-heavy workloads

3. **Python for Prototyping**
   - Excellent readability
   - Use for non-time-critical paths
   - Consider NumPy/Cython for production

4. **WASM vs Backend**
   - **WASM**: Use for real-time, interactive processing
   - **Backend**: Use for large datasets or server-side processing
   - **Hybrid**: Best of both worlds

## Future Optimization Opportunities

### C++ Backend
- **Flat hash maps**: Could reduce voxel downsampling time by 20-30%
- Libraries: `absl::flat_hash_map` or `ankerl::unordered_dense::map`
- Potential improvement: ~2.6-3.0s (from ~3.7s)

### Point Smoothing
- **Spatial indexing**: Currently O(n), could optimize further with octree/k-d tree
- Would reduce from O(n) to O(n log n) for very large datasets
- Not currently implemented (fair comparison requires identical algorithms)

## Conclusion

These benchmarks demonstrate that:

1. **Algorithm characteristics** significantly impact performance differences between languages
2. **Rust** provides the best overall performance-to-maintainability ratio
3. **C++** remains competitive, especially for grid-based algorithms
4. **WASM** is viable for real-time browser-based processing
5. **Fair benchmarks** require identical algorithms with platform-optimized implementations

All implementations are **fair, optimized, and produce identical results**. The performance differences reflect real platform characteristics, making these benchmarks valuable for informed technology choices.

## See Also

- [Voxel Downsampling Benchmark](benchmark-voxel-downsampling.md) - Detailed analysis
- [Voxel Debug Benchmark](benchmark-voxel-debug.md) - Visualization performance
- [Point Cloud Smoothing Benchmark](benchmark-point-smoothing.md) - Smoothing performance

