# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
# cython: cdivision=True
# cython: nonecheck=False
# cython: initializedcheck=False
"""
Ultra-Optimized Cython Backend Voxel Debug Tool
Generates voxel grid positions for visualization/debugging.
Compiled to C for maximum performance.
"""

import math
from libc.math cimport floor

def generate_voxel_centers(list points, float voxel_size, dict global_bounds):
    """
    Cython-optimized voxel debug function.
    
    Args:
        points: Flat list of coordinates [x1, y1, z1, x2, y2, z2, ...]
        voxel_size: Size of voxel grid cells
        global_bounds: Dictionary with min_x, max_x, min_y, max_y, min_z, max_z
        
    Returns:
        Flat list of voxel center coordinates [x1, y1, z1, x2, y2, z2, ...]
    """
    cdef int point_count = len(points) // 3
    if point_count == 0:
        return []
    
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
    
    # Pre-calculate constants at the start for efficiency
    cdef float inv_voxel_size = 1.0 / voxel_size
    cdef float half_voxel_size = voxel_size * 0.5
    cdef float offset_x = min_x + half_voxel_size
    cdef float offset_y = min_y + half_voxel_size
    cdef float offset_z = min_z + half_voxel_size
    
    # Use dict with integer keys for fast lookup
    # Python dict is faster than set for integer keys in Cython
    cdef dict voxel_keys = {}
    
    # Process points in chunks
    cdef int CHUNK_SIZE = 1024
    cdef int chunk_start, chunk_end, i, i3
    cdef float x, y, z
    cdef int voxel_x, voxel_y, voxel_z
    cdef long long voxel_key  # Use long long for 64-bit keys
    
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
            
            # Use integer hash key for fast lookup
            voxel_key = (<long long>voxel_x << 32) | (<long long>voxel_y << 16) | <long long>voxel_z
            
            # OPTIMIZATION: Use dict with integer keys (faster than set with tuples in Cython)
            # Just store a dummy value - we only care about unique keys
            voxel_keys[voxel_key] = None
            
            i += 1
    
    # Build result
    cdef int voxel_count = len(voxel_keys)
    cdef list voxel_grid_positions = [0.0] * (voxel_count * 3)
    cdef int idx = 0
    cdef int voxel_x_out, voxel_y_out, voxel_z_out
    
    # OPTIMIZATION: Iterate with explicit type casts and direct calculation
    for voxel_key in voxel_keys:
        # Extract voxel coordinates from integer key
        voxel_x_out = <int>(voxel_key >> 32)
        voxel_y_out = <int>((voxel_key >> 16) & 0xFFFF)
        # Sign-extend 16-bit to int (handle negative coordinates)
        if voxel_y_out & 0x8000:
            voxel_y_out = voxel_y_out | 0xFFFF0000
        voxel_z_out = <int>(voxel_key & 0xFFFF)
        if voxel_z_out & 0x8000:
            voxel_z_out = voxel_z_out | 0xFFFF0000
        
        # Calculate voxel grid position (center of voxel grid cell)
        voxel_grid_positions[idx] = offset_x + <float>voxel_x_out * voxel_size
        voxel_grid_positions[idx + 1] = offset_y + <float>voxel_y_out * voxel_size
        voxel_grid_positions[idx + 2] = offset_z + <float>voxel_z_out * voxel_size
        idx += 3
    
    return voxel_grid_positions

