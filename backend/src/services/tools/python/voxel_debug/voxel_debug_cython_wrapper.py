#!/usr/bin/env python3
"""
Cython-optimized voxel debug backend.
Uses compiled Cython extension for maximum performance.
Uses binary protocol for fast I/O (replaces JSON).
"""

import sys
import os
import struct
import time

# Add build directory to path to find compiled Cython module
script_dir = os.path.dirname(os.path.abspath(__file__))
tools_dir = os.path.dirname(os.path.dirname(script_dir))
build_dir = os.path.join(tools_dir, 'build')
sys.path.insert(0, build_dir)

# Import the compiled Cython module
from voxel_debug_cython import generate_voxel_centers

def main():
    """Main function to process voxel debug request."""
    try:
        # OPTIMIZATION: Read binary input instead of JSON (much faster!)
        # Binary format: [u32 pointCount][f32 voxelSize][f32 minX][f32 minY][f32 minZ][f32 maxX][f32 maxY][f32 maxZ][f32* pointData]
        
        # Read binary header (32 bytes: 4 for u32 + 7*4 for floats)
        header = sys.stdin.buffer.read(32)
        if len(header) < 32:
            sys.exit(1)
        
        # Unpack header (little-endian)
        point_count, voxel_size, min_x, min_y, min_z, max_x, max_y, max_z = struct.unpack('<I7f', header)
        
        # Validate input
        if point_count == 0 or voxel_size <= 0:
            # Write empty result (4 bytes: voxelCount = 0)
            sys.stdout.buffer.write(struct.pack('<I', 0))
            sys.stdout.buffer.flush()
            return
        
        # Safety check: prevent unreasonable allocations (max 100M points = ~1.2GB)
        MAX_POINTS = 100_000_000
        if point_count > MAX_POINTS:
            print(f"Error: point_count {point_count} exceeds maximum {MAX_POINTS}", file=sys.stderr)
            sys.exit(1)
        
        # Read point data directly (binary, no JSON parsing!)
        float_count = point_count * 3
        bytes_to_read = float_count * 4
        if bytes_to_read > 2_000_000_000:  # 2GB max
            print(f"Error: bytes_to_read {bytes_to_read} exceeds maximum 2GB", file=sys.stderr)
            sys.exit(1)
        
        point_data_bytes = sys.stdin.buffer.read(bytes_to_read)
        if len(point_data_bytes) < bytes_to_read:
            sys.exit(1)
        
        # Convert bytes to floats (little-endian)
        points = list(struct.unpack(f'<{float_count}f', point_data_bytes))
        
        # Prepare global_bounds dict for Cython function
        global_bounds = {
            'min_x': min_x,
            'min_y': min_y,
            'min_z': min_z,
            'max_x': max_x,
            'max_y': max_y,
            'max_z': max_z
        }
        
        # Generate voxel centers using Cython
        start_time = time.time()
        voxel_grid_positions = generate_voxel_centers(points, voxel_size, global_bounds)
        processing_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        
        # OPTIMIZATION: Write binary output instead of JSON (much faster!)
        # Binary format: [u32 voxelCount][f32* voxelGridPositions]
        
        voxel_count = len(voxel_grid_positions) // 3
        
        # Write voxel count (4 bytes)
        sys.stdout.buffer.write(struct.pack('<I', voxel_count))
        
        # Write voxel grid positions directly (binary, no JSON serialization!)
        if voxel_count > 0:
            sys.stdout.buffer.write(struct.pack(f'<{len(voxel_grid_positions)}f', *voxel_grid_positions))
        
        sys.stdout.buffer.flush()
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        # Write empty result on error (4 bytes: voxelCount = 0)
        try:
            sys.stdout.buffer.write(struct.pack('<I', 0))
            sys.stdout.buffer.flush()
        except:
            pass
        sys.exit(1)

if __name__ == "__main__":
    main()
