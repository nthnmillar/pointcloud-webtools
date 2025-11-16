#!/usr/bin/env python3
"""
Wrapper script for Cython-optimized voxel downsampling.
Uses the compiled Cython module if available, falls back to pure Python.
"""

import sys
import json
import time

try:
    # Try to import Cython module
    from voxel_downsample_cython import voxel_downsample
    USING_CYTHON = True
except ImportError:
    # Fallback to pure Python
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    from voxel_downsample_python import voxel_downsample
    USING_CYTHON = False

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
            "voxel_count": voxel_count,
            "using_cython": USING_CYTHON
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
            "voxel_count": 0,
            "using_cython": USING_CYTHON
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()

