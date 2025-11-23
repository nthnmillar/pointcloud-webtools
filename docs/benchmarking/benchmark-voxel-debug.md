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
| **C++ WASM Main** | 136 ms | 1.0x | Fastest WASM implementation |
| **Rust WASM Main** | 154 ms | 1.13x | Very close to C++ WASM |
| **C++ WASM Worker** | 164 ms | 1.21x | Minimal worker overhead |
| **Rust WASM Worker** | 178 ms | 1.31x | Slightly more worker overhead |
| **TypeScript** | 208 ms | 1.53x | Good performance, pure JS |
| **C++ Backend** | 419 ms | 3.08x | Fastest backend (after binary optimization) |
| **Rust Backend** | 673 ms | 4.95x | Good performance |
| **Python Backend (Cython)** | 670 ms | 4.93x | Very close to Rust BE |

### Performance Analysis

#### Browser Performance (WASM) - C++ and Rust are Very Close
- **C++ WASM Main** (136ms) is **slightly faster** than **Rust WASM Main** (154ms) - 13% difference
- Both use **LLVM-based compilers** (Emscripten for C++, native LLVM for Rust)
- Both use integer keys for HashSet operations
- Worker overhead is minimal for both implementations

#### Backend Performance - C++ BE is Fastest After Binary Optimization

**Key Finding**: After implementing **binary protocol optimization**, **C++ Backend** (419ms) is now **fastest**, followed by Python BE (670ms) and Rust BE (673ms).

**Why C++ BE is Fastest:**
1. **Binary Protocol**: All backends now use WebSocket with binary protocol instead of HTTP/JSON, eliminating serialization overhead
2. **Optimized Compilation**: Compiled with `clang++` using `-O3 -march=native -ffast-math -flto` flags
3. **Efficient I/O**: Single `memcpy` for header reading, direct binary I/O
4. **Hash Set Performance**: Uses `std::unordered_map` with integer keys, well-optimized by compiler

**Why Rust BE and Python BE are Close:**
- **Rust BE** (673ms): Uses `FxHashSet` with integer keys, highly optimized
- **Python BE** (670ms): Cython compiles to C, uses integer keys, slightly faster than Rust BE
- Both benefit from binary protocol optimization

**Binary Protocol Impact:**
The switch from HTTP/JSON to WebSocket/binary protocol was critical for backend performance:
- Eliminates JSON serialization/deserialization overhead
- Zero-copy data transfer between Node.js and native processes
- Direct binary I/O for point cloud data

### Accuracy Verification

All implementations produce **consistent results**:
- ✅ Same voxel count (~25,942, within input variance)
- ⚠️ Voxel center positions may have minor differences between implementations due to floating-point precision and coordinate extraction methods

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

### C++ WASM/BE Integer Keys
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

## Key Optimizations Applied

### Binary Protocol (All Backends)
All backend implementations now use **WebSocket with binary protocol** instead of HTTP with JSON:
- **Eliminates JSON serialization overhead** (significant for large point clouds)
- **Zero-copy data transfer**: Direct binary I/O between Node.js and native processes
- **Frontend**: Sends binary data directly via WebSocket (`ws.send(pointCloudData.buffer)`) - no JSON conversion
- **Backend**: Sends binary response directly via WebSocket (`ws.send(voxelGridPositionsBuffer)`) - no JSON conversion

This optimization was critical - it significantly improved all backend performance, with C++ BE benefiting the most.

## Recommendations

### For Browser (WASM)
- **Use C++ WASM Main** (136ms) for fastest performance if UI blocking is acceptable
- **Use Rust WASM Main** (154ms) for very close performance with Rust's safety guarantees
- **Use C++ WASM Worker** (164ms) for non-blocking processing with minimal overhead
- **Use TypeScript** (208ms) for simpler code and good performance

### For Backend
- **Use C++ Backend** (419ms) - fastest backend implementation
- **Use Python Backend (Cython)** (670ms) - very close to Rust, excellent if you prefer Python ecosystem
- **Use Rust Backend** (673ms) - good performance, excellent safety guarantees

All backends are now well-optimized with binary protocol, making them suitable for production use.

## Technical Notes

### Binary Protocol Implementation
All backend implementations use the same binary protocol:
1. **Input**: JSON header (small metadata) + binary `Float32Array` for point cloud data
2. **Output**: JSON header (metadata) + binary `Float32Array` for voxel grid positions
3. **Zero-copy**: Frontend creates `Float32Array` directly from `ArrayBuffer` without conversion

### Compiler Optimizations
- **C++ BE**: `clang++` with `-O3 -march=native -ffast-math -flto`
- **Rust BE**: `opt-level = 3`, `lto = "fat"`, `codegen-units = 1`
- **Python BE**: Cython compiled with `-O3 -march=native -ffast-math`
