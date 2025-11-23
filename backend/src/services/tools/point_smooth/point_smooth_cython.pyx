# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
# cython: cdivision=True
# cython: nonecheck=False
# cython: initializedcheck=False
"""
Ultra-Optimized Cython Backend Point Cloud Smoothing Tool
Smooths point cloud using spatial hashing algorithm.
Compiled to C for maximum performance.
"""

import math
from libc.math cimport floor

def point_cloud_smooth(list points, float smoothing_radius, int iterations):
    """
    Cython-optimized point cloud smoothing function.
    
    Args:
        points: Flat list of coordinates [x1, y1, z1, x2, y2, z2, ...]
        smoothing_radius: Radius for smoothing
        iterations: Number of smoothing iterations
        
    Returns:
        List of smoothed point coordinates [x1, y1, z1, x2, y2, z2, ...]
    """
    cdef int point_count = len(points) // 3
    if point_count == 0:
        return []
    
    # Validate inputs
    if smoothing_radius <= 0 or math.isnan(smoothing_radius) or math.isinf(smoothing_radius):
        raise ValueError(f"Invalid smoothing_radius: {smoothing_radius}")
    if iterations <= 0:
        raise ValueError(f"Invalid iterations: {iterations}")
    
    # Initialize (same as Rust BE)
    cdef list smoothed_points = list(points)
    cdef list temp_points = [0.0] * len(points)  # Pre-allocate temp buffer
    cdef float radius_squared = smoothing_radius * smoothing_radius
    cdef float cell_size = smoothing_radius
    cdef float inv_cell_size = 1.0 / cell_size
    
    # Find bounding box - single pass (same as Rust BE)
    cdef float min_x = points[0]
    cdef float max_x = points[0]
    cdef float min_y = points[1]
    cdef float max_y = points[1]
    cdef float min_z = points[2]
    cdef float max_z = points[2]
    
    cdef int i
    cdef int i3
    for i in range(3, len(points), 3):
        if points[i] < min_x:
            min_x = points[i]
        if points[i] > max_x:
            max_x = points[i]
        if points[i + 1] < min_y:
            min_y = points[i + 1]
        if points[i + 1] > max_y:
            max_y = points[i + 1]
        if points[i + 2] < min_z:
            min_z = points[i + 2]
        if points[i + 2] > max_z:
            max_z = points[i + 2]
    
    # Calculate grid dimensions (same as Rust BE)
    cdef int grid_width = <int>((max_x - min_x) * inv_cell_size) + 1
    cdef int grid_height = <int>((max_y - min_y) * inv_cell_size) + 1
    cdef int grid_depth = <int>((max_z - min_z) * inv_cell_size) + 1
    cdef int grid_size = grid_width * grid_height * grid_depth
    
    # OPTIMIZATION: Pre-compute grid_width * grid_height to avoid repeated multiplication
    cdef int grid_width_height = grid_width * grid_height
    
    # Pre-allocate grid (simple nested lists - Python lists are optimized for append)
    cdef list grid = [[] for _ in range(grid_size)]
    
    # OPTIMIZATION: Chunked processing for better cache locality (like voxel downsampling)
    cdef int CHUNK_SIZE = 1024
    cdef int chunk_start, chunk_end, chunk_end_calc
    
    # Smoothing iterations (same as Rust BE)
    cdef int _iter
    cdef int j
    cdef int j3
    cdef float x, y, z
    cdef float jx, jy, jz
    cdef float sum_x, sum_y, sum_z
    cdef int count
    cdef float count_plus_1
    cdef int gx, gy, gz
    cdef int grid_index
    cdef float neighbor_x, neighbor_y, neighbor_z
    cdef float dx2, dy2, dz2
    cdef float distance_squared
    cdef int dx, dy, dz
    cdef list cell
    
    for _iter in range(iterations):
        # Copy current state to temp buffer (slice assignment is fastest in Cython!)
        temp_points[:] = smoothed_points
        
        # Clear grid efficiently (reuse structure - optimized with while loop)
        i = 0
        while i < grid_size:
            grid[i].clear()
            i += 1
        
        # Populate grid with PREVIOUS iteration's point positions (chunked processing)
        for chunk_start in range(0, point_count, CHUNK_SIZE):
            chunk_end_calc = chunk_start + CHUNK_SIZE
            chunk_end = chunk_end_calc if chunk_end_calc < point_count else point_count
            
            # OPTIMIZATION: Use while loop instead of range for better C code generation
            i = chunk_start
            while i < chunk_end:
                i3 = i * 3
                x = <float>temp_points[i3]
                y = <float>temp_points[i3 + 1]
                z = <float>temp_points[i3 + 2]
                
                # Calculate grid index (pre-computed grid_width_height to avoid repeated multiplication)
                gx = <int>((x - min_x) * inv_cell_size)
                gy = <int>((y - min_y) * inv_cell_size)
                gz = <int>((z - min_z) * inv_cell_size)
                grid_index = gx + gy * grid_width + gz * grid_width_height
                
                if 0 <= grid_index < grid_size:
                    grid[grid_index].append(i)
                i += 1
        
        # Process each point using spatial hash (chunked processing for cache locality)
        for chunk_start in range(0, point_count, CHUNK_SIZE):
            chunk_end_calc = chunk_start + CHUNK_SIZE
            chunk_end = chunk_end_calc if chunk_end_calc < point_count else point_count
            
            # OPTIMIZATION: Use while loop instead of range for better C code generation
            i = chunk_start
            while i < chunk_end:
                i3 = i * 3
                x = <float>temp_points[i3]
                y = <float>temp_points[i3 + 1]
                z = <float>temp_points[i3 + 2]
                
                sum_x = 0.0
                sum_y = 0.0
                sum_z = 0.0
                count = 0
                
                # Check neighboring grid cells (3x3x3 = 27 cells) - optimized with while loops
                dx = -1
                while dx <= 1:
                    dy = -1
                    while dy <= 1:
                        dz = -1
                        while dz <= 1:
                            # Calculate grid index for neighbor (pre-computed grid_width_height)
                            neighbor_x = x + <float>dx * cell_size
                            neighbor_y = y + <float>dy * cell_size
                            neighbor_z = z + <float>dz * cell_size
                            gx = <int>((neighbor_x - min_x) * inv_cell_size)
                            gy = <int>((neighbor_y - min_y) * inv_cell_size)
                            gz = <int>((neighbor_z - min_z) * inv_cell_size)
                            grid_index = gx + gy * grid_width + gz * grid_width_height
                            
                            if 0 <= grid_index < grid_size:
                                # OPTIMIZATION: Cache grid cell reference to avoid repeated indexing
                                cell = grid[grid_index]
                                # Direct iteration (Cython optimizes this better than indexed access)
                                for j in cell:
                                    if i == j:
                                        continue
                                    
                                    j3 = j * 3
                                    # OPTIMIZATION: Direct type casts for all accesses
                                    jx = <float>temp_points[j3]
                                    jy = <float>temp_points[j3 + 1]
                                    jz = <float>temp_points[j3 + 2]
                                    
                                    # OPTIMIZATION: Pre-compute differences (avoid repeated subtractions)
                                    dx2 = jx - x
                                    dy2 = jy - y
                                    dz2 = jz - z
                                    distance_squared = dx2 * dx2 + dy2 * dy2 + dz2 * dz2
                                    
                                    if distance_squared <= radius_squared:
                                        sum_x += jx
                                        sum_y += jy
                                        sum_z += jz
                                        count += 1
                            dz += 1
                        dy += 1
                    dx += 1
            
                # Apply smoothing if neighbors found (pre-compute division)
                if count > 0:
                    count_plus_1 = <float>(count + 1)
                    smoothed_points[i3] = (x + sum_x) / count_plus_1
                    smoothed_points[i3 + 1] = (y + sum_y) / count_plus_1
                    smoothed_points[i3 + 2] = (z + sum_z) / count_plus_1
                i += 1
    
    return smoothed_points

