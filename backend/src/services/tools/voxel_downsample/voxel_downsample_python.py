#!/usr/bin/env python3
"""
Optimized Python Backend Voxel Downsampling Tool
Reduces point cloud density by averaging points within voxel grid cells.
Optimized to match Rust BE performance using spatial hashing and chunked processing.
"""

import sys
import json
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
        # Read JSON input from stdin (like Rust BE)
        input_json = sys.stdin.read()
        input_data = json.loads(input_json)
        
        voxel_size = input_data['voxel_size']
        points = input_data['point_cloud_data']
        global_bounds = input_data['global_bounds']
        
        # Perform voxel downsampling
        start_time = time.time()
        downsampled_points, voxel_count = voxel_downsample(points, voxel_size, global_bounds)
        processing_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        
        # Prepare result
        result = {
            "success": True,
            "downsampled_points": downsampled_points,
            "original_count": len(points) // 3,
            "downsampled_count": len(downsampled_points) // 3,
            "processing_time": processing_time,
            "voxel_size": voxel_size,
            "voxel_count": voxel_count
        }
        
        # Output JSON result to stdout (like Rust BE)
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "original_count": 0,
            "downsampled_count": 0,
            "processing_time": 0,
            "voxel_size": 0,
            "voxel_count": 0
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()
