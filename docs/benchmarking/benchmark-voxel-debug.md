# Voxel Debug Visualization Benchmark Results

## Overview

Voxel debug visualization generates wireframe cubes representing voxels in the grid for debugging and visualizing voxel downsampling. It calculates unique voxel grid centers and displays a fraction of them as wireframe cubes (typically limited to ~2000 cubes) to provide an idea of voxel sizes and density without the computational expense of rendering all voxels. For example, a point cloud with 1M points may generate ~25,942 voxels, but only a subset is visualized.

## Algorithm Characteristics

- **Type**: Set-based (unique coordinate tracking)
- **Complexity**: O(n) where n is the number of points
- **Key Operations**: 
  - HashSet insertions for unique voxel tracking
  - Voxel center coordinate calculation
- **Data Structure**: HashSet/Set for unique voxel coordinates
- **Visualization**: Wireframe cubes at a fraction of voxel center positions, a limited subset for performance
- **Simpler than downsampling**: No averaging calculations needed, just unique coordinate tracking

See [Benchmark Methodology](benchmark.md) for general implementation details.

## Benchmark Results

### Test Dataset: 1M Points
- **Voxel Size**: 2.0
- **Original Points**: 1,000,000
- **Voxel Count**: ~25,942 (expected across all implementations)

### Performance (Processing Time)

| Implementation | Time (ms) | Relative Speed | Notes |
|---------------|-----------|----------------|-------|
| **C++ WASM Main** | 136 ms | 1.0x | Fastest WASM implementation |
| **Rust WASM Main** | 154 ms | 1.13x | Very close to C++ WASM |
| **C++ WASM Worker** | 164 ms | 1.21x | Minimal worker overhead |
| **Rust WASM Worker** | 178 ms | 1.31x | Slightly more worker overhead |
| **TypeScript** | 208 ms | 1.53x | Good performance, pure JS |
| **C++ Backend** | 419 ms | 3.08x | Fastest backend (after binary optimization) |
| **Rust Backend** | 673 ms | 4.95x | Good performance |
| **Python Backend (Cython)** | 670 ms | 4.93x | Very close to Rust BE |

### Performance Analysis

#### Browser Performance (WASM)
- **C++ WASM Main** (136ms) is fastest, **Rust WASM Main** (154ms) is 13% slower
- Both use LLVM-based compilers, so performance is very close
- Worker overhead is minimal (~20-30ms)

#### Backend Performance
- **C++ Backend** (419ms) is **fastest** - 60% faster than Rust/Python
- **Python Cython** (670ms) and **Rust** (673ms) are very close
- **Key Finding**: C++ BE's HashSet implementation performs best among backend implementations
- **Note**: Backend is 3-5x slower than WASM due to network I/O overhead

**Why C++ BE is Fastest Among Backends**:
- Set-based operations favor C++'s optimized `std::unordered_set` implementation
- Efficient integer key handling


### Accuracy Verification

All implementations produce **consistent results**:
- ✅ Same voxel count (~25,942, within input variance)
- ⚠️ Voxel center positions may have minor differences between implementations due to floating-point precision and coordinate extraction methods

## Test-Specific Details

### Implementation Differences
- **C++/Rust/Python**: Use integer keys `(voxelX << 32) | (voxelY << 16) | voxelZ` for maximum performance
- **TypeScript**: Uses string keys due to JavaScript's 32-bit integer limitations

### Binary Protocol Impact
All backends use WebSocket with binary protocol, eliminating JSON serialization overhead and making comparisons fair.

## Recommendations

### Browser (WASM)
- **C++ WASM Main** (136ms) - Fastest, use if UI blocking is acceptable
- **Rust WASM Worker** (178ms) - Best for non-blocking processing
- **TypeScript** (208ms) - Good performance, simpler code

### Backend
- **C++ Backend** (419ms) - Fastest backend option for this algorithm
- **Python Cython** (670ms) or **Rust** (673ms) - Very close, choose by team preference

## Key Findings

1. **WASM implementations are fastest overall** (136-178ms) - 3-5x faster than backend
2. **C++ Backend is fastest among backends** (419ms vs 670-673ms) for this Set-based algorithm
3. **WASM performance is very close** (13% difference between C++ and Rust) due to LLVM optimizations

## Conclusion

For voxel debug visualization, **WASM implementations provide the best overall performance** (136-178ms) and are 3-5x faster than backend (419-673ms). Among backend implementations, **C++ Backend is fastest** (419ms). **This tool is most likely suitable for frontend (WASM) implementation** due to the performance advantage and better real-time feedback for interactive debugging workflows. All implementations produce consistent results.
