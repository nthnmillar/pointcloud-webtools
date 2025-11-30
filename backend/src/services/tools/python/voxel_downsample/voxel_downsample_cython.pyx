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

