#!/usr/bin/env python3
"""
Cython-optimized voxel downsampling backend.
Uses compiled Cython extension for maximum performance.
Uses binary protocol for fast I/O.
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
from voxel_downsample_cython import voxel_downsample

def main():
    """Main function to process voxel downsampling request."""
    try:
        # Read binary input for fast I/O
        # Binary format: [u32 pointCount][f32 voxelSize][f32 minX][f32 minY][f32 minZ][f32 maxX][f32 maxY][f32 maxZ][f32* pointData]
        
        # Read binary header (32 bytes: 4 for u32 + 7*4 for floats)
        header = sys.stdin.buffer.read(32)
        if len(header) < 32:
            sys.exit(1)
        
        # Unpack header (little-endian)
        point_count, voxel_size, min_x, min_y, min_z, max_x, max_y, max_z = struct.unpack('<I7f', header)
        
        # Validate input
        if point_count == 0 or voxel_size <= 0:
            # Write empty result (4 bytes: outputCount = 0)
            sys.stdout.buffer.write(struct.pack('<I', 0))
            sys.stdout.buffer.flush()
            return
        
        # Safety check: prevent unreasonable allocations (max 100M points = ~1.2GB)
        MAX_POINTS = 100_000_000
        if point_count > MAX_POINTS:
            print(f"Error: point_count {point_count} exceeds maximum {MAX_POINTS}", file=sys.stderr)
            sys.exit(1)
        
        # Read point data directly as binary
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
        
        # Perform voxel downsampling using Cython
        start_time = time.time()
        downsampled_points, voxel_count = voxel_downsample(points, voxel_size, global_bounds)
        processing_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        
        # Write binary output for fast I/O
        # Binary format: [u32 outputCount][f32* downsampledPoints]
        
        output_count = len(downsampled_points) // 3
        
        # Write output count (4 bytes)
        sys.stdout.buffer.write(struct.pack('<I', output_count))
        
        # Write downsampled points directly as binary
        if output_count > 0:
            sys.stdout.buffer.write(struct.pack(f'<{len(downsampled_points)}f', *downsampled_points))
        
        sys.stdout.buffer.flush()
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        # Write empty result on error (4 bytes: outputCount = 0)
        try:
            sys.stdout.buffer.write(struct.pack('<I', 0))
            sys.stdout.buffer.flush()
        except:
            pass
        sys.exit(1)

if __name__ == "__main__":
    main()

