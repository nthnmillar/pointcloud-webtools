#!/usr/bin/env python3
"""
Ultra-Optimized Python Backend Point Cloud Smoothing Tool
Optimized to match Rust BE exactly - same algorithm, same optimizations.
"""

import sys
import json
import time
from typing import List

def point_cloud_smooth(
    points: List[float],
    smoothing_radius: float,
    iterations: int
) -> List[float]:
    """
    Ultra-optimized point cloud smoothing - matches Rust BE exactly.
    Same algorithm, same optimizations, line-for-line equivalent.
    """
    if not points or len(points) % 3 != 0:
        return []
    
    point_count = len(points) // 3
    if point_count == 0:
        return []
    
    if smoothing_radius <= 0:
        raise ValueError(f"Invalid smoothing_radius: {smoothing_radius}")
    if iterations <= 0:
        raise ValueError(f"Invalid iterations: {iterations}")
    
    # Initialize (exact same as Rust BE)
    smoothed_points = list(points)
    temp_points = [0.0] * len(points)  # Pre-allocate temp buffer (critical optimization)
    radius_squared = smoothing_radius * smoothing_radius
    cell_size = smoothing_radius
    inv_cell_size = 1.0 / cell_size
    
    # Find bounding box - single pass (exact same as Rust BE)
    min_x = points[0]
    max_x = points[0]
    min_y = points[1]
    max_y = points[1]
    min_z = points[2]
    max_z = points[2]
    
    for i in range(3, len(points), 3):
        min_x = min(min_x, points[i])
        max_x = max(max_x, points[i])
        min_y = min(min_y, points[i + 1])
        max_y = max(max_y, points[i + 1])
        min_z = min(min_z, points[i + 2])
        max_z = max(max_z, points[i + 2])
    
    # Calculate grid dimensions (exact same as Rust BE)
    grid_width = int((max_x - min_x) * inv_cell_size) + 1
    grid_height = int((max_y - min_y) * inv_cell_size) + 1
    grid_depth = int((max_z - min_z) * inv_cell_size) + 1
    grid_size = grid_width * grid_height * grid_depth
    
    # Pre-allocate grid (like Rust Vec::with_capacity(8))
    grid = [[] for _ in range(grid_size)]
    
    # Smoothing iterations (exact same as Rust BE)
    for _iter in range(iterations):
        # Copy current state to temp buffer (fast element-by-element copy)
        temp_points[:] = smoothed_points  # Slice assignment is faster than creating new list
        
        # Clear grid efficiently (reuse structure - critical optimization)
        for cell in grid:
            cell.clear()
        
        # Populate grid with PREVIOUS iteration's point positions (exact same as Rust BE)
        for i in range(point_count):
            i3 = i * 3
            x = temp_points[i3]
            y = temp_points[i3 + 1]
            z = temp_points[i3 + 2]
            
            # Calculate grid index (exact same calculation as Rust BE)
            gx = int((x - min_x) * inv_cell_size)
            gy = int((y - min_y) * inv_cell_size)
            gz = int((z - min_z) * inv_cell_size)
            grid_index = gx + gy * grid_width + gz * grid_width * grid_height
            
            if 0 <= grid_index < grid_size:
                grid[grid_index].append(i)
        
        # Process each point using spatial hash (exact same as Rust BE)
        for i in range(point_count):
            i3 = i * 3
            x = temp_points[i3]
            y = temp_points[i3 + 1]
            z = temp_points[i3 + 2]
            
            sum_x = 0.0
            sum_y = 0.0
            sum_z = 0.0
            count = 0
            
            # Check neighboring grid cells (3x3x3 = 27 cells) - exact same as Rust BE
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for dz in (-1, 0, 1):
                        # Calculate grid index for neighbor (exact same as Rust)
                        # Rust: get_grid_index(x + dx as f32 * cell_size, y + dy as f32 * cell_size, z + dz as f32 * cell_size)
                        neighbor_x = x + dx * cell_size
                        neighbor_y = y + dy * cell_size
                        neighbor_z = z + dz * cell_size
                        gx = int((neighbor_x - min_x) * inv_cell_size)
                        gy = int((neighbor_y - min_y) * inv_cell_size)
                        gz = int((neighbor_z - min_z) * inv_cell_size)
                        grid_index = gx + gy * grid_width + gz * grid_width * grid_height
                        
                        if 0 <= grid_index < grid_size:
                            cell = grid[grid_index]
                            # Direct iteration (like Rust's &grid[grid_index])
                            for j in cell:
                                if i == j:
                                    continue
                                
                                j3 = j * 3
                                jx = temp_points[j3]
                                jy = temp_points[j3 + 1]
                                jz = temp_points[j3 + 2]
                                
                                dx2 = jx - x
                                dy2 = jy - y
                                dz2 = jz - z
                                distance_squared = dx2 * dx2 + dy2 * dy2 + dz2 * dz2
                                
                                if distance_squared <= radius_squared:
                                    sum_x += jx
                                    sum_y += jy
                                    sum_z += jz
                                    count += 1
            
            # Apply smoothing if neighbors found (exact same as Rust BE)
            if count > 0:
                count_plus_1 = count + 1
                smoothed_points[i3] = (x + sum_x) / count_plus_1
                smoothed_points[i3 + 1] = (y + sum_y) / count_plus_1
                smoothed_points[i3 + 2] = (z + sum_z) / count_plus_1
    
    return smoothed_points

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
            "iterations": iterations
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
            "iterations": 0
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()
