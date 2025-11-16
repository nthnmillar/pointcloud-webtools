#!/usr/bin/env python3
"""
Cython-optimized voxel debug backend.
Uses compiled Cython extension for maximum performance.
"""

import sys
import json
import time

# Import the compiled Cython module
from voxel_debug_cython import generate_voxel_centers

def main():
    """Main function to process voxel debug request."""
    try:
        # Read JSON input from stdin (like Rust BE)
        input_json = sys.stdin.read()
        input_data = json.loads(input_json)
        
        voxel_size = input_data['voxel_size']
        points = input_data['point_cloud_data']
        global_bounds = input_data['global_bounds']
        
        # Generate voxel centers using Cython
        start_time = time.time()
        voxel_grid_positions = generate_voxel_centers(points, voxel_size, global_bounds)
        processing_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        
        # Prepare result
        voxel_count = len(voxel_grid_positions) // 3
        result = {
            "success": True,
            "voxel_grid_positions": voxel_grid_positions,
            "voxel_count": voxel_count,
            "processing_time": processing_time,
            "using_cython": True,
            "cython_module": str(type(generate_voxel_centers).__module__)
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

