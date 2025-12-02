# Backend Tools

This directory contains implementations of point cloud processing tools in multiple languages.

## Directory Structure

```
tools/
├── rust/              # Rust implementations
│   ├── Cargo.toml     # Rust project configuration
│   ├── src/           # Rust source files
│   └── target/        # Rust build artifacts (gitignored)
│
├── cpp/               # C++ implementations
│   ├── voxel_downsample/
│   ├── voxel_debug/
│   └── point_smooth/
│
├── python/            # Python implementations (includes Cython)
│   ├── voxel_downsample/
│   │   ├── *.py       # Python scripts
│   │   ├── *.pyx      # Cython source files
│   │   ├── setup_cython.py
│   │   └── build_cython.sh
│   ├── voxel_debug/
│   └── point_smooth/
│
└── build/             # All compiled executables (gitignored)
    ├── voxel_downsample
    ├── voxel_debug
    ├── point_smooth_cpp
    ├── *_rust         # Rust binaries
    └── *.so           # Cython compiled extensions
```

## Building

### Rust

```bash
cd rust
cargo build --release
# Executables will be in rust/target/release/
# Copy to build/ directory for use
```

### C++

```bash
cd cpp/voxel_downsample
./build_cpp.sh
# Executable will be in build/voxel_downsample
```

### Python/Cython

```bash
cd python/voxel_downsample
./build_cython.sh
# Compiled .so file will be in build/
```

## Executable Paths

All executables are referenced from the `build/` directory:

- C++: `build/voxel_downsample`, `build/voxel_debug`, `build/point_smooth_cpp`
- Rust: `build/voxel_downsample_rust`, `build/voxel_debug_rust`, `build/point_smooth_rust`
- Python: `python/*/` (scripts)
- Cython: `build/*.so` (shared libraries)
