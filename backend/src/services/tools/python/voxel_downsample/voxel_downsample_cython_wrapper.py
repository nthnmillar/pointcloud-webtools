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
from voxel_downsample_cython import voxel_downsample, voxel_downsample_with_attributes

def main():
    """Main function to process voxel downsampling request."""
    try:
        # Extended header: 36 bytes (32 + 4-byte flags). flags: bit0=colors, bit1=intensity, bit2=classification
        header = sys.stdin.buffer.read(36)
        if len(header) < 36:
            sys.exit(1)

        point_count, voxel_size, min_x, min_y, min_z, max_x, max_y, max_z = struct.unpack('<I7f', header[:32])
        flags = struct.unpack('<I', header[32:36])[0]
        use_colors = (flags & 1) != 0
        use_intensity = (flags & 2) != 0
        use_classification = (flags & 4) != 0

        if point_count == 0 or voxel_size <= 0:
            sys.stdout.buffer.write(struct.pack('<I', 0))
            sys.stdout.buffer.flush()
            return

        MAX_POINTS = 100_000_000
        if point_count > MAX_POINTS:
            print(f"Error: point_count {point_count} exceeds maximum {MAX_POINTS}", file=sys.stderr)
            sys.exit(1)

        float_count = point_count * 3
        bytes_to_read = float_count * 4
        if bytes_to_read > 2_000_000_000:
            print(f"Error: bytes_to_read {bytes_to_read} exceeds maximum 2GB", file=sys.stderr)
            sys.exit(1)

        point_data_bytes = sys.stdin.buffer.read(bytes_to_read)
        if len(point_data_bytes) < bytes_to_read:
            sys.exit(1)
        points = list(struct.unpack(f'<{float_count}f', point_data_bytes))

        colors = None
        intensities = None
        classifications = None
        if use_colors:
            buf = sys.stdin.buffer.read(float_count * 4)
            if len(buf) < float_count * 4:
                sys.exit(1)
            colors = list(struct.unpack(f'<{float_count}f', buf))
        if use_intensity:
            buf = sys.stdin.buffer.read(point_count * 4)
            if len(buf) < point_count * 4:
                sys.exit(1)
            intensities = list(struct.unpack(f'<{point_count}f', buf))
        if use_classification:
            buf = sys.stdin.buffer.read(point_count)
            if len(buf) < point_count:
                sys.exit(1)
            classifications = list(struct.unpack(f'<{point_count}B', buf))

        global_bounds = {
            'min_x': min_x,
            'min_y': min_y,
            'min_z': min_z,
            'max_x': max_x,
            'max_y': max_y,
            'max_z': max_z
        }

        start_time = time.time()
        if not use_colors and not use_intensity and not use_classification:
            downsampled_points, _ = voxel_downsample(points, voxel_size, global_bounds)
            output_count = len(downsampled_points) // 3
            sys.stdout.buffer.write(struct.pack('<I', output_count))
            if output_count > 0:
                sys.stdout.buffer.write(struct.pack(f'<{len(downsampled_points)}f', *downsampled_points))
        else:
            downsampled_points, downsampled_colors, downsampled_intensities, downsampled_classifications = voxel_downsample_with_attributes(
                points, colors, intensities, classifications, voxel_size, global_bounds
            )
            output_count = len(downsampled_points) // 3
            sys.stdout.buffer.write(struct.pack('<I', output_count))
            sys.stdout.buffer.write(struct.pack(f'<{len(downsampled_points)}f', *downsampled_points))
            if downsampled_colors is not None:
                sys.stdout.buffer.write(struct.pack(f'<{len(downsampled_colors)}f', *downsampled_colors))
            if downsampled_intensities is not None:
                sys.stdout.buffer.write(struct.pack(f'<{len(downsampled_intensities)}f', *downsampled_intensities))
            if downsampled_classifications is not None:
                sys.stdout.buffer.write(struct.pack(f'<{len(downsampled_classifications)}B', *downsampled_classifications))
        sys.stdout.buffer.flush()

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        try:
            sys.stdout.buffer.write(struct.pack('<I', 0))
            sys.stdout.buffer.flush()
        except Exception:
            pass
        sys.exit(1)

if __name__ == "__main__":
    main()

