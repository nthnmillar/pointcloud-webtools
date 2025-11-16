#!/usr/bin/env python3
"""
Wrapper script for Cython-optimized point cloud smoothing.
Uses the compiled Cython module if available, falls back to pure Python.
"""

import sys
import json
import time

try:
    # Try to import Cython module
    from point_smooth_cython import point_cloud_smooth
    USING_CYTHON = True
except ImportError:
    # Fallback to pure Python
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    from point_smooth_python import point_cloud_smooth
    USING_CYTHON = False

def main():
    """Main function to process point cloud smoothing request."""
    try:
        input_json = sys.stdin.read()
        input_data = json.loads(input_json)
        
        points = input_data['point_cloud_data']
        smoothing_radius = input_data['smoothing_radius']
        iterations = input_data['iterations']
        
        start_time = time.time()
        smoothed_points = point_cloud_smooth(points, smoothing_radius, iterations)
        processing_time = (time.time() - start_time) * 1000
        
        result = {
            "success": True,
            "smoothed_points": smoothed_points,
            "original_count": len(points) // 3,
            "smoothed_count": len(smoothed_points) // 3,
            "processing_time": processing_time,
            "smoothing_radius": smoothing_radius,
            "iterations": iterations,
            "using_cython": USING_CYTHON
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "smoothed_points": [],
            "original_count": 0,
            "smoothed_count": 0,
            "processing_time": 0,
            "smoothing_radius": 0,
            "iterations": 0,
            "using_cython": USING_CYTHON
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()

