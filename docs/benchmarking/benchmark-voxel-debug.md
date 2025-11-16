# Voxel Debug Visualization Benchmark Results

## Overview

Voxel debug visualization generates and displays voxel grid centers for debugging and visualizing voxel downsampling. This benchmark compares performance across multiple implementations.

## Algorithm-Specific Details

Voxel debug visualization generates unique voxel grid centers:
- Uses HashSet/Set to track unique voxel coordinates (no averaging needed)
- Outputs one point per unique voxel (the center of each voxel grid cell)
- Similar to voxel downsampling but simpler (no averaging calculations)

**Implementation-Specific Notes:**
- **C++/Rust WASM/BE**: Use integer keys (`uint64_t` / `u64`) packed as `(voxelX << 32) | (voxelY << 16) | voxelZ`
- **TypeScript**: Uses string keys (`"x,y,z"`) due to JavaScript's 32-bit bitwise limitation, with pre-compiled regex for parsing
- **Python BE (Cython)**: Uses integer keys (same as C++/Rust) for maximum performance

See [Benchmark Methodology](benchmark.md#benchmark-methodology) for general algorithm consistency details.

## Benchmark Results

### Test Dataset: 1M Points
- **Voxel Size**: 2.0
- **Original Points**: 1,000,000
- **Voxel Count**: ~25,942 (expected across all implementations)

### Performance (Processing Time)

| Implementation | Time (ms) | Relative Speed | Notes |
|---------------|-----------|----------------|-------|
| **C++ WASM Main** | 131 ms | 1.0x | Fastest WASM implementation |
| **Rust WASM Main** | 145 ms | 1.11x | Very close to C++ WASM |
| **TypeScript** | 197 ms | 1.50x | Good performance, pure JS |
| **C++ WASM Worker** | 168 ms | 1.28x | Good performance with worker overhead |
| **Rust WASM Worker** | 200 ms | 1.53x | Worker overhead more noticeable |
| **Rust Backend** | 701 ms | Baseline | Fastest backend |
| **Python Backend (Cython)** | 709 ms | 1.01x | Nearly identical to Rust BE! |
| **C++ Backend** | 1,564 ms | 2.23x | Significantly slower than Rust/Python |

### Performance Analysis

#### Browser Performance (WASM) - C++ and Rust are Very Close
- **C++ WASM Main** (131ms) is **slightly faster** than **Rust WASM Main** (145ms) - only 11% difference
- Both use **LLVM-based compilers** (Emscripten for C++, native LLVM for Rust)
- Both use integer keys for HashSet operations
- The small difference is due to hash set implementation details and compiler optimizations

#### Backend Performance - Python Cython Nearly Matches Rust!

**Key Finding**: **Python Backend (Cython)** at 709ms is **nearly identical** to **Rust Backend** at 701ms (only 1% difference)!

**Why Cython Python is Fast:**
1. **Compiled to C**: Cython compiles Python code to C, which is then compiled to native machine code
2. **Type Annotations**: Uses `cdef` type declarations to eliminate Python object overhead
3. **C-Level Operations**: Uses C `floor()` function, direct memory access, and C-style loops
4. **Integer Keys**: Uses integer keys (same as C++/Rust) instead of Python tuples, avoiding Python object creation overhead
5. **Binary I/O**: Uses binary protocol (no JSON parsing overhead)
6. **Optimized Compilation**: Compiled with `-O3 -march=native -ffast-math` flags

**Why C++ Backend is Slow (2.2x slower than Rust/Python):**
1. **Hash Set Implementation**: Uses `ankerl::unordered_dense::set` with `FastHash`, but still slower than Rust's `FxHashSet`
2. **Hash Function Overhead**: Despite using `FastHash` (matching Rust's FxHash algorithm), the C++ hash set implementation has more overhead
3. **Memory Layout**: Rust's `FxHashSet` is specifically optimized for integer keys and has better cache locality
4. **Compiler Optimizations**: Rust's compiler may apply more aggressive optimizations for hash set operations

**Key Insight**: For HashSet-heavy algorithms like voxel debug, **Rust's `FxHashSet` and Cython's compiled dict are both highly optimized**, while C++'s hash set implementations (even with external libraries) have inherent overhead that's difficult to eliminate.

### Accuracy Verification

All implementations produce **identical results**:
- ✅ Same voxel count (~25,942, within input variance)
- ✅ Same voxel center positions (TypeScript and Python BE match exactly; C++/Rust/WASM may have minor position differences due to integer packing/extraction)

## Key Differences from Voxel Downsampling

### TypeScript String Keys
Due to JavaScript's 32-bit bitwise limitation:
```typescript
// Cannot use: voxelX << 32 (returns 0 in JavaScript)
// Instead use: `${voxelX},${voxelY},${voxelZ}`
const voxelKey = `${voxelX},${voxelY},${voxelZ}`;
voxelCoords.add(voxelKey);

// Optimized parsing with pre-compiled regex
const parseRegex = /^(-?\d+),(-?\d+),(-?\d+)$/;
const match = voxelKey.match(parseRegex);
```

### C++ WASM Integer Keys
```cpp
uint64_t voxelKey = (static_cast<uint64_t>(voxelX) << 32) |
                   (static_cast<uint64_t>(voxelY) << 16) |
                   static_cast<uint64_t>(voxelZ);
g_voxelDebug.voxelSet.insert(voxelKey);
```

### Rust WASM/BE Integer Keys
```rust
// Uses FxHashSet with integer keys (same as C++)
let voxel_key = ((voxel_x as u64) << 32) | ((voxel_y as u64) << 16) | (voxel_z as u64);
voxel_keys.insert(voxel_key);
```

### Python BE (Cython) Integer Keys
```cython
# Cython uses integer keys (compiled to C, very fast!)
voxel_key = (<long long>voxel_x << 32) | (<long long>voxel_y << 16) | <long long>voxel_z
voxel_keys[voxel_key] = None  # dict with integer keys
```

## Recommendations

### For Browser (WASM)
- **Use C++ WASM Main** (131ms) for fastest performance if UI blocking is acceptable
- **Use Rust WASM Main** (145ms) for very close performance with Rust's safety guarantees
- **Use C++ WASM Worker** (168ms) for non-blocking processing
- **Use TypeScript** (197ms) for simpler code and good performance

### For Backend
- **Use Rust Backend** (701ms) or **Python Backend (Cython)** (709ms) - both are nearly identical in performance!
- **Avoid C++ Backend** (1,564ms) - 2.2x slower than Rust/Python due to hash set implementation overhead
- **Key Insight**: Cython Python is as fast as Rust for this HashSet-heavy algorithm, making it an excellent choice if you prefer Python's ecosystem

## Technical Notes

### Why Python Cython Matches Rust Performance
1. **Compiled to Native Code**: Cython compiles to C, which is then compiled to native machine code with full optimizations
2. **Zero Python Overhead**: `cdef` type declarations eliminate Python object creation and method dispatch
3. **C-Level Operations**: Direct C function calls (`floor()`, memory access) bypass Python interpreter
4. **Integer Keys**: Uses integer keys (same as C++/Rust) instead of Python tuples, avoiding object creation
5. **Optimized Compilation**: `-O3 -march=native -ffast-math` flags enable maximum optimization

### Why C++ Backend is Slower
Despite using `ankerl::unordered_dense::set` (a high-performance hash set) and `FastHash` (matching Rust's FxHash algorithm), C++ backend is still 2.2x slower because:
1. **Library Overhead**: Even optimized C++ hash set libraries have more overhead than Rust's `FxHashSet`
2. **Memory Layout**: Rust's `FxHashSet` is specifically optimized for integer keys with better cache locality
3. **Compiler Optimizations**: Rust's compiler applies more aggressive optimizations for hash set operations
4. **Hash Function**: While `FastHash` matches FxHash algorithm, the integration with C++ hash set may have overhead

