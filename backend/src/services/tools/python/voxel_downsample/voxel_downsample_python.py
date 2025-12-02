#!/usr/bin/env python3
"""
Optimized Python Backend Voxel Downsampling Tool
Reduces point cloud density by averaging points within voxel grid cells.
Optimized using spatial hashing and chunked processing for high performance.
"""

import sys
import struct
import time
import math
from typing import List, Tuple, Dict, Any

def voxel_downsample(points: List[float], voxel_size: float, global_bounds: Dict[str, float]) -> Tuple[List[float], int]:
    """
    Perform optimized voxel downsampling on point cloud (matching Rust BE performance).
    
    Args:
        points: Flat list of coordinates [x1, y1, z1, x2, y2, z2, ...]
        voxel_size: Size of voxel grid cells
        global_bounds: Dictionary with min_x, max_x, min_y, max_y, min_z, max_z
        
    Returns:
        Tuple of (downsampled_points, voxel_count)
    """
    if not points or len(points) % 3 != 0:
        return [], 0
    
    point_count = len(points) // 3
    if point_count == 0:
        return [], 0
    
    # Validate voxel_size
    if voxel_size <= 0 or math.isnan(voxel_size) or math.isinf(voxel_size):
        raise ValueError(f"Invalid voxel_size: {voxel_size}. Must be a positive number.")
    
    # Use provided global bounds
    min_x = global_bounds['min_x']
    max_x = global_bounds['max_x']
    min_y = global_bounds['min_y']
    max_y = global_bounds['max_y']
    min_z = global_bounds['min_z']
    max_z = global_bounds['max_z']
    
    # Validate bounds
    if (math.isnan(min_x) or math.isnan(max_x) or math.isnan(min_y) or 
        math.isnan(max_y) or math.isnan(min_z) or math.isnan(max_z)):
        raise ValueError(f"Invalid bounds detected: ({min_x}, {max_x}, {min_y}, {max_y}, {min_z}, {max_z})")
    
    # Calculate inverse voxel size for efficiency
    inv_voxel_size = 1.0 / voxel_size
    
    # OPTIMIZATION: Use dict with list values, but cache reference to avoid multiple lookups
    # Lists are mutable so we can update in-place (faster than recreating tuples)
    voxel_map = {}  # key -> [sum_x, sum_y, sum_z, count]
    
    # OPTIMIZATION: Process points in chunks for better cache locality (like Rust BE)
    # Use 1024 to match Rust/C++ chunk size
    CHUNK_SIZE = 1024
    point_count = len(points) // 3
    
    # OPTIMIZATION: Pre-calculate loop bounds to avoid repeated calculations
    for chunk_start in range(0, point_count, CHUNK_SIZE):
        chunk_end = min(chunk_start + CHUNK_SIZE, point_count)
        for i in range(chunk_start, chunk_end):
            i3 = i * 3
            # OPTIMIZATION: Direct indexing (faster than unpacking)
            x = points[i3]
            y = points[i3 + 1]
            z = points[i3 + 2]
            
            # OPTIMIZATION: Skip NaN/Inf checks in hot loop (assume data is validated)
            # Only check if absolutely necessary - these are expensive
            
            # Calculate voxel coordinates - use floor() to match TypeScript/Rust Math.floor()
            voxel_x = int(math.floor((x - min_x) * inv_voxel_size))
            voxel_y = int(math.floor((y - min_y) * inv_voxel_size))
            voxel_z = int(math.floor((z - min_z) * inv_voxel_size))
            
            # Create voxel key using bit shifting (like Rust BE)
            voxel_key = (voxel_x << 32) | (voxel_y << 16) | voxel_z
            
            # OPTIMIZATION: Single dict lookup, cache reference, update in-place
            voxel_data = voxel_map.get(voxel_key)
            if voxel_data is None:
                voxel_map[voxel_key] = [x, y, z, 1]
            else:
                # Update in-place (faster than recreating tuple/list)
                voxel_data[0] += x
                voxel_data[1] += y
                voxel_data[2] += z
                voxel_data[3] += 1
    
    # OPTIMIZATION: Pre-allocate result list for better performance
    voxel_count = len(voxel_map)
    downsampled_points = [0.0] * (voxel_count * 3)
    
    # OPTIMIZATION: Average points in each voxel and build result in one pass
    idx = 0
    for voxel_data in voxel_map.values():
        # OPTIMIZATION: Pre-calculate inverse count to avoid 3 divisions
        inv_count = 1.0 / voxel_data[3]
        downsampled_points[idx] = voxel_data[0] * inv_count
        downsampled_points[idx + 1] = voxel_data[1] * inv_count
        downsampled_points[idx + 2] = voxel_data[2] * inv_count
        idx += 3
    
    return downsampled_points, voxel_count

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
        
        # Prepare global_bounds dict
        global_bounds = {
            'min_x': min_x,
            'min_y': min_y,
            'min_z': min_z,
            'max_x': max_x,
            'max_y': max_y,
            'max_z': max_z
        }
        
        # Perform voxel downsampling
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
