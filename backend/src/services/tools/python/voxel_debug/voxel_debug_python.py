#!/usr/bin/env python3
"""
Optimized Python Backend Voxel Debug Tool
Generates voxel grid positions for visualization/debugging.
Optimized to match Rust BE performance using spatial hashing.
"""

import sys
import json
import time
import math
from typing import List, Dict

def generate_voxel_centers(points: List[float], voxel_size: float, global_bounds: Dict[str, float]) -> List[float]:
    """
    Generate voxel grid positions (centers of occupied voxels) for debugging.
    
    Args:
        points: Flat list of coordinates [x1, y1, z1, x2, y2, z2, ...]
        voxel_size: Size of voxel grid cells
        global_bounds: Dictionary with min_x, max_x, min_y, max_y, min_z, max_z
        
    Returns:
        Flat list of voxel center coordinates [x1, y1, z1, x2, y2, z2, ...]
    """
    if not points or len(points) % 3 != 0:
        return []
    
    point_count = len(points) // 3
    if point_count == 0:
        return []
    
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
    half_voxel_size = voxel_size * 0.5
    
    # Calculate offsets to match Rust/TypeScript implementation
    offset_x = min_x + half_voxel_size
    offset_y = min_y + half_voxel_size
    offset_z = min_z + half_voxel_size
    
    # Use set to store unique voxel coordinates (like Rust BE)
    voxel_coords = set()
    
    # Process points in chunks for better cache locality (like Rust BE)
    CHUNK_SIZE = 1000
    for chunk_start in range(0, len(points), CHUNK_SIZE * 3):
        chunk_end = min(chunk_start + CHUNK_SIZE * 3, len(points))
        for i in range(chunk_start, chunk_end, 3):
            if i + 2 < len(points):
                x, y, z = points[i], points[i + 1], points[i + 2]
                
                # Skip points with invalid coordinates
                if math.isnan(x) or math.isnan(y) or math.isnan(z) or math.isinf(x) or math.isinf(y) or math.isinf(z):
                    continue
                
                # Calculate voxel coordinates (same as Rust BE)
                voxel_x = int(math.floor((x - min_x) * inv_voxel_size))
                voxel_y = int(math.floor((y - min_y) * inv_voxel_size))
                voxel_z = int(math.floor((z - min_z) * inv_voxel_size))
                
                # Store unique voxel coordinates
                voxel_coords.add((voxel_x, voxel_y, voxel_z))
    
    # Convert voxel coordinates to grid positions (centers)
    voxel_grid_positions = []
    for voxel_x, voxel_y, voxel_z in voxel_coords:
        # Convert voxel coordinates back to world coordinates (center of voxel)
        center_x = offset_x + voxel_x * voxel_size
        center_y = offset_y + voxel_y * voxel_size
        center_z = offset_z + voxel_z * voxel_size
        
        voxel_grid_positions.extend([center_x, center_y, center_z])
    
    return voxel_grid_positions

def main():
    """Main function to process voxel debug request."""
    try:
        # Read JSON input from stdin (like Rust BE)
        input_json = sys.stdin.read()
        input_data = json.loads(input_json)
        
        voxel_size = input_data['voxel_size']
        points = input_data['point_cloud_data']
        global_bounds = input_data['global_bounds']
        
        # Generate voxel centers
        start_time = time.time()
        voxel_grid_positions = generate_voxel_centers(points, voxel_size, global_bounds)
        processing_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        
        # Prepare result
        voxel_count = len(voxel_grid_positions) // 3
        result = {
            "success": True,
            "voxel_grid_positions": voxel_grid_positions,
            "voxel_count": voxel_count,
            "processing_time": processing_time
        }
        
        # Output JSON result to stdout (like Rust BE)
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "voxel_grid_positions": [],
            "voxel_count": 0,
            "processing_time": 0
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()

