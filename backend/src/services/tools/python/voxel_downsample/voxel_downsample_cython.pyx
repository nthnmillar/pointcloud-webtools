# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
# cython: cdivision=True
# cython: nonecheck=False
# cython: initializedcheck=False
"""
Ultra-Optimized Cython Backend Voxel Downsampling Tool
Reduces point cloud density by averaging points within voxel grid cells.
Compiled to C for maximum performance.
"""

import math
from libc.math cimport floor

def voxel_downsample(list points, float voxel_size, dict global_bounds):
    """
    Cython-optimized voxel downsampling function.
    
    Args:
        points: Flat list of coordinates [x1, y1, z1, x2, y2, z2, ...]
        voxel_size: Size of voxel grid cells
        global_bounds: Dictionary with min_x, max_x, min_y, max_y, min_z, max_z
        
    Returns:
        Tuple of (downsampled_points, voxel_count)
    """
    cdef int point_count = len(points) // 3
    if point_count == 0:
        return [], 0
    
    # Validate voxel_size
    if voxel_size <= 0 or math.isnan(voxel_size) or math.isinf(voxel_size):
        raise ValueError(f"Invalid voxel_size: {voxel_size}")
    
    # Extract bounds
    cdef float min_x = global_bounds['min_x']
    cdef float min_y = global_bounds['min_y']
    cdef float min_z = global_bounds['min_z']
    
    # Validate bounds
    if (math.isnan(min_x) or math.isnan(min_y) or math.isnan(min_z)):
        raise ValueError("Invalid bounds detected")
    
    # Calculate inverse voxel size
    cdef float inv_voxel_size = 1.0 / voxel_size
    
    # Voxel map
    cdef dict voxel_map = {}
    
    # Process points in chunks
    cdef int CHUNK_SIZE = 1024
    cdef int chunk_start, chunk_end, i, i3
    cdef float x, y, z
    cdef int voxel_x, voxel_y, voxel_z
    cdef long long voxel_key  # Use long long for 64-bit keys
    cdef list voxel_data
    cdef object temp_list
    
    # OPTIMIZATION: Pre-calculate min() result to avoid repeated calls
    cdef int chunk_end_calc
    
    for chunk_start in range(0, point_count, CHUNK_SIZE):
        chunk_end_calc = chunk_start + CHUNK_SIZE
        chunk_end = chunk_end_calc if chunk_end_calc < point_count else point_count
        
        # OPTIMIZATION: Use while loop instead of range for better C code generation
        i = chunk_start
        while i < chunk_end:
            i3 = i * 3
            x = <float>points[i3]
            y = <float>points[i3 + 1]
            z = <float>points[i3 + 2]
            
            # Calculate voxel coordinates using C floor function (no Python call)
            voxel_x = <int>floor((x - min_x) * inv_voxel_size)
            voxel_y = <int>floor((y - min_y) * inv_voxel_size)
            voxel_z = <int>floor((z - min_z) * inv_voxel_size)
            
            # Create voxel key using bit shifting
            voxel_key = (<long long>voxel_x << 32) | (<long long>voxel_y << 16) | <long long>voxel_z
            
            # OPTIMIZATION: Use try/except for dict lookup (faster than .get() in Cython)
            try:
                voxel_data = voxel_map[voxel_key]
                voxel_data[0] = <float>voxel_data[0] + x
                voxel_data[1] = <float>voxel_data[1] + y
                voxel_data[2] = <float>voxel_data[2] + z
                voxel_data[3] = <int>voxel_data[3] + 1
            except KeyError:
                # Create new list - use list literal for faster creation
                temp_list = [x, y, z, 1]
                voxel_map[voxel_key] = temp_list
            
            i += 1
    
    # Build result
    cdef int voxel_count = len(voxel_map)
    cdef list downsampled_points = [0.0] * (voxel_count * 3)
    cdef int idx = 0
    cdef float inv_count
    cdef float sum_x, sum_y, sum_z
    cdef int count
    
    # OPTIMIZATION: Iterate with explicit type casts
    for voxel_data in voxel_map.values():
        sum_x = <float>voxel_data[0]
        sum_y = <float>voxel_data[1]
        sum_z = <float>voxel_data[2]
        count = <int>voxel_data[3]
        inv_count = 1.0 / <float>count
        downsampled_points[idx] = sum_x * inv_count
        downsampled_points[idx + 1] = sum_y * inv_count
        downsampled_points[idx + 2] = sum_z * inv_count
        idx += 3
    
    return downsampled_points, voxel_count


def voxel_downsample_with_attributes(
    list points,
    object colors,  # None or list of float, length point_count*3
    object intensities,  # None or list of float, length point_count
    object classifications,  # None or list of int (0-255), length point_count
    float voxel_size,
    dict global_bounds
):
    """
    Voxel downsampling with optional colors (average), intensities (average), classifications (mode per voxel).
    Returns (downsampled_points, downsampled_colors or None, downsampled_intensities or None, downsampled_classifications or None).
    """
    cdef int point_count = len(points) // 3
    if point_count == 0:
        return [], None, None, None

    if voxel_size <= 0 or math.isnan(voxel_size) or math.isinf(voxel_size):
        raise ValueError(f"Invalid voxel_size: {voxel_size}")

    cdef float min_x = global_bounds['min_x']
    cdef float min_y = global_bounds['min_y']
    cdef float min_z = global_bounds['min_z']
    if (math.isnan(min_x) or math.isnan(min_y) or math.isnan(min_z)):
        raise ValueError("Invalid bounds detected")

    cdef bint use_colors = colors is not None and len(colors) == point_count * 3
    cdef bint use_intensity = intensities is not None and len(intensities) == point_count
    cdef bint use_classification = classifications is not None and len(classifications) == point_count

    cdef float inv_voxel_size = 1.0 / voxel_size
    cdef dict voxel_map = {}
    cdef int CHUNK_SIZE = 1024
    cdef int chunk_start, chunk_end, i, i3
    cdef float x, y, z, r, g, b, intensity
    cdef int voxel_x, voxel_y, voxel_z, cls
    cdef long long voxel_key
    cdef list voxel_data
    cdef dict class_counts
    cdef int chunk_end_calc

    for chunk_start in range(0, point_count, CHUNK_SIZE):
        chunk_end_calc = chunk_start + CHUNK_SIZE
        chunk_end = chunk_end_calc if chunk_end_calc < point_count else point_count
        i = chunk_start
        while i < chunk_end:
            i3 = i * 3
            x = <float>points[i3]
            y = <float>points[i3 + 1]
            z = <float>points[i3 + 2]
            voxel_x = <int>floor((x - min_x) * inv_voxel_size)
            voxel_y = <int>floor((y - min_y) * inv_voxel_size)
            voxel_z = <int>floor((z - min_z) * inv_voxel_size)
            voxel_key = (<long long>voxel_x << 32) | (<long long>voxel_y << 16) | <long long>voxel_z

            r = <float>colors[i3] if use_colors else 0.0
            g = <float>colors[i3 + 1] if use_colors else 0.0
            b = <float>colors[i3 + 2] if use_colors else 0.0
            intensity = <float>intensities[i] if use_intensity else 0.0
            cls = <int>classifications[i] if use_classification else 0

            try:
                voxel_data = voxel_map[voxel_key]
                voxel_data[0] += x
                voxel_data[1] += y
                voxel_data[2] += z
                voxel_data[3] += 1
                if use_colors:
                    voxel_data[4] += r
                    voxel_data[5] += g
                    voxel_data[6] += b
                if use_intensity:
                    voxel_data[7] += intensity
                if use_classification:
                    class_counts = voxel_data[8]
                    class_counts[cls] = class_counts.get(cls, 0) + 1
            except KeyError:
                class_counts = {}
                if use_classification:
                    class_counts[cls] = 1
                voxel_map[voxel_key] = [
                    x, y, z, 1,
                    r, g, b,
                    intensity,
                    class_counts
                ]
            i += 1

    cdef int voxel_count = len(voxel_map)
    cdef list downsampled_points = [0.0] * (voxel_count * 3)
    cdef list downsampled_colors = [0.0] * (voxel_count * 3) if use_colors else None
    cdef list downsampled_intensities = [0.0] * voxel_count if use_intensity else None
    cdef list downsampled_classifications = [0] * voxel_count if use_classification else None
    cdef int idx = 0
    cdef float inv_count
    cdef int count, max_c, mode_cls

    for voxel_data in voxel_map.values():
        count = <int>voxel_data[3]
        inv_count = 1.0 / <float>count
        downsampled_points[idx] = voxel_data[0] * inv_count
        downsampled_points[idx + 1] = voxel_data[1] * inv_count
        downsampled_points[idx + 2] = voxel_data[2] * inv_count
        if use_colors:
            downsampled_colors[idx] = voxel_data[4] * inv_count
            downsampled_colors[idx + 1] = voxel_data[5] * inv_count
            downsampled_colors[idx + 2] = voxel_data[6] * inv_count
        if use_intensity:
            downsampled_intensities[idx // 3] = voxel_data[7] * inv_count
        if use_classification:
            class_counts = voxel_data[8]
            max_c = 0
            mode_cls = 0
            for k, c in class_counts.items():
                if c > max_c:
                    max_c = c
                    mode_cls = k
            downsampled_classifications[idx // 3] = mode_cls
        idx += 3

    return downsampled_points, downsampled_colors, downsampled_intensities, downsampled_classifications

