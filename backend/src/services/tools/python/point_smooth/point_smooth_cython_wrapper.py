#!/usr/bin/env python3
"""
Wrapper script for Cython-optimized point cloud smoothing.
Uses the compiled Cython module if available, falls back to pure Python.
Uses binary protocol for fast I/O.
"""

import sys
import struct
import time

# Add build directory to path to find compiled Cython module
import os
script_dir = os.path.dirname(os.path.abspath(__file__))
tools_dir = os.path.dirname(os.path.dirname(script_dir))
build_dir = os.path.join(tools_dir, 'build')
if build_dir not in sys.path:
    sys.path.insert(0, build_dir)

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
        # Read binary input (12 bytes header: u32 pointCount, f32 smoothingRadius, f32 iterations)
        header = sys.stdin.buffer.read(12)
        if len(header) != 12:
            sys.exit(1)
        
        point_count, smoothing_radius, iterations = struct.unpack('<Iff', header)
        iterations = int(iterations)
        
        # Validate input
        if point_count == 0 or smoothing_radius <= 0 or iterations <= 0:
            # Write empty result (4 bytes: pointCount = 0)
            sys.stdout.buffer.write(struct.pack('<I', 0))
            sys.stdout.buffer.flush()
            return
        
        # Read point data (pointCount * 3 floats)
        float_count = point_count * 3
        bytes_to_read = float_count * 4
        point_data = sys.stdin.buffer.read(bytes_to_read)
        if len(point_data) != bytes_to_read:
            sys.exit(1)
        
        # Unpack floats (little-endian)
        points = list(struct.unpack(f'<{float_count}f', point_data))
        
        # Process point cloud smoothing
        start_time = time.time()
        smoothed_points = point_cloud_smooth(points, smoothing_radius, iterations)
        processing_time = (time.time() - start_time) * 1000
        
        # Write binary output
        # Format: [u32 pointCount][f32* smoothedPoints]
        output_count = len(smoothed_points) // 3
        sys.stdout.buffer.write(struct.pack('<I', output_count))
        sys.stdout.buffer.write(struct.pack(f'<{len(smoothed_points)}f', *smoothed_points))
        sys.stdout.buffer.flush()
        
    except Exception as e:
        # On error, write empty result
        sys.stdout.buffer.write(struct.pack('<I', 0))
        sys.stdout.buffer.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
