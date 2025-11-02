# Voxel Debug Visualization Benchmark Results

## Overview

Voxel debug visualization generates and displays voxel grid centers for debugging and visualizing voxel downsampling. This benchmark compares performance across multiple implementations.

## Algorithm Consistency

All implementations use **identical algorithms**:

- **Voxel Calculation**: `Math.floor()` / `std::floor()` for consistent coordinates
- **Bounds**: Uses provided `globalBounds` (not calculated internally)
- **Output**: Generates unique voxel centers (one point per unique voxel)
- **Optimizations**: Integer hashing, chunked processing, pre-calculated inverses

## Implementation Details

### TypeScript (TS)
- **Location**: `frontend/src/services/tools/VoxelDownsampleDebug/VoxelDownsampleDebugTS.ts`
- **Data Structure**: `Set<string>` with `${voxelX},${voxelY},${voxelZ}` keys
- **Optimizations**: Pre-compiled regex for parsing, chunked processing
- **Note**: Uses string keys due to JavaScript's 32-bit bitwise limitation

### C++ WASM Main Thread
- **Location**: `frontend/src/wasm/cpp/tools.cpp` → `showVoxelDebug()`
- **Data Structure**: `std::unordered_set<uint64_t>` with integer keys
- **Optimizations**: Direct memory access, integer hashing, chunked processing

### C++ WASM Worker
- **Location**: `frontend/src/services/tools/CppWasmWorker.worker.ts`
- **Execution**: Web Worker (separate thread)
- **Performance**: Same as Main Thread

### Rust WASM Main Thread
- **Location**: `frontend/src/wasm/rust/src/lib.rs` → `generate_voxel_centers()`
- **Data Structure**: `HashSet<(i32, i32, i32)>` with tuple keys
- **Optimizations**: Direct slice access, efficient hashing

### Rust WASM Worker
- **Location**: `frontend/src/services/tools/RustWasmWorker.worker.ts`
- **Execution**: Web Worker (separate thread)
- **Performance**: Same as Main Thread

### C++ Backend
- **Location**: `backend/src/services/tools/voxel_debug/voxel_debug.cpp`
- **Output Format**: Space-separated floats
- **Optimizations**: Integer hashing, chunked processing

### Rust Backend
- **Location**: `backend/src/services/tools/voxel_debug/voxel_debug_rust.rs`
- **JSON Output**: Uses serde_json
- **Optimizations**: HashSet with tuple keys, efficient serialization

### Python Backend
- **Location**: `backend/src/services/tools/voxel_debug/voxel_debug_python.py`
- **Data Structure**: `set()` with tuple keys
- **Optimizations**: Chunked processing, efficient JSON output

## Benchmark Results

### Test Dataset: ~5,832 Points
- **Voxel Size**: 2.0
- **Voxel Count**: ~997 (expected across all implementations)

### Performance (Processing Time)

| Implementation | Time (ms) | Relative Speed | Notes |
|---------------|-----------|----------------|-------|
| **Rust WASM Worker** | ~1 ms | 1.0x (fastest WASM) | Best for browser |
| **Rust WASM Main** | ~1 ms | 1.0x | Fast but blocks UI |
| **TypeScript** | ~1-3 ms | 1.0-3x | Good performance |
| **C++ WASM Worker** | ~3-4 ms | 3-4x | Good performance |
| **C++ WASM Main** | ~4-6 ms | 4-6x | Blocks UI |

*Note: Backend implementations not commonly used for debug visualization (typically browser-only tool)*

### Accuracy Verification

All implementations produce **identical results**:
- ✅ Same voxel count (within input variance)
- ✅ Same voxel center positions

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

### Rust WASM Tuple Keys
```rust
let voxel_coords: HashSet<(i32, i32, i32)> = HashSet::new();
voxel_coords.insert((voxel_x, voxel_y, voxel_z));
```

## Recommendations

- **Use Rust WASM Worker** for best browser performance
- **Use TypeScript** for simpler code and good performance on small datasets
- Debug visualization is typically done client-side, so backend options less relevant

