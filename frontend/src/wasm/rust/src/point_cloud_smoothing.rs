pub fn point_cloud_smooth_internal(
    points: &[f32],
    smoothing_radius: f32,
    iterations: i32,
) -> Vec<f32> {
    console_log!("Rust WASM: Starting O(n) spatial hashing point cloud smoothing with {} points, radius: {}, iterations: {}", 
                points.len() / 3, smoothing_radius, iterations);
    
    // Validate input
    if points.len() % 3 != 0 {
        console_log!("Rust WASM: Error - points array length {} is not divisible by 3", points.len());
        return points.to_vec();
    }
    
    let point_count = points.len() / 3;
    let length = points.len();
    let mut smoothed_points = points.to_vec();
    let radius_squared = smoothing_radius * smoothing_radius;
    let cell_size = smoothing_radius;
    let inv_cell_size = 1.0f32 / cell_size;
    
    // Find bounding box - single pass
    let mut min_x = points[0];
    let mut max_x = points[0];
    let mut min_y = points[1];
    let mut max_y = points[1];
    let mut min_z = points[2];
    let mut max_z = points[2];
    
    for i in (0..length).step_by(3) {
        min_x = min_x.min(points[i]);
        max_x = max_x.max(points[i]);
        min_y = min_y.min(points[i + 1]);
        max_y = max_y.max(points[i + 1]);
        min_z = min_z.min(points[i + 2]);
        max_z = max_z.max(points[i + 2]);
    }
    
    // Calculate grid dimensions
    let grid_width = ((max_x - min_x) * inv_cell_size) as usize + 1;
    let grid_height = ((max_y - min_y) * inv_cell_size) as usize + 1;
    let grid_depth = ((max_z - min_z) * inv_cell_size) as usize + 1;
    let grid_size = grid_width * grid_height * grid_depth;
    
    // Pre-allocate grid with capacity estimation
    let mut grid: Vec<Vec<usize>> = vec![Vec::with_capacity(8); grid_size];
    
    // Hash function to get grid index (same as C++ WASM - truncate toward zero)
    let get_grid_index = |x: f32, y: f32, z: f32| -> i32 {
        let gx = ((x - min_x) * inv_cell_size) as i32;
        let gy = ((y - min_y) * inv_cell_size) as i32;
        let gz = ((z - min_z) * inv_cell_size) as i32;
        gx + gy * grid_width as i32 + gz * grid_width as i32 * grid_height as i32
    };
    
    // Smoothing iterations using spatial hashing (same as C++ WASM)
    for _iter in 0..iterations {
        // Copy current state to temp buffer (same as C++ WASM)
        let temp_points = smoothed_points.clone();
        
        // Clear grid efficiently
        for cell in &mut grid {
            cell.clear();
        }
        
        // Populate grid with PREVIOUS iteration's point positions (same as C++ WASM)
        for i in 0..point_count {
            let i3 = i * 3;
            let x = temp_points[i3];
            let y = temp_points[i3 + 1];
            let z = temp_points[i3 + 2];
            let grid_index = get_grid_index(x, y, z);
            if grid_index >= 0 && grid_index < grid_size as i32 {
                grid[grid_index as usize].push(i);
            }
        }
        
        // Process each point using spatial hash (same as C++ WASM)
        for i in 0..point_count {
            let i3 = i * 3;
            let x = temp_points[i3];
            let y = temp_points[i3 + 1];
            let z = temp_points[i3 + 2];
            
            let mut sum_x = 0.0;
            let mut sum_y = 0.0;
            let mut sum_z = 0.0;
            let mut count = 0;
            
            // Check neighboring grid cells (3x3x3 = 27 cells) - same as C++ WASM
            for dx in -1..=1 {
                for dy in -1..=1 {
                    for dz in -1..=1 {
                        let grid_index = get_grid_index(
                            x + dx as f32 * cell_size,
                            y + dy as f32 * cell_size,
                            z + dz as f32 * cell_size
                        );
                        
                        if grid_index >= 0 && grid_index < grid_size as i32 {
                            for &j in &grid[grid_index as usize] {
                                if i == j { continue; }
                                
                                let j3 = j * 3;
                                let jx = temp_points[j3];
                                let jy = temp_points[j3 + 1];
                                let jz = temp_points[j3 + 2];
                                
                                let dx2 = jx - x;
                                let dy2 = jy - y;
                                let dz2 = jz - z;
                                
                                let distance_squared = dx2 * dx2 + dy2 * dy2 + dz2 * dz2;
                                
                                if distance_squared <= radius_squared {
                                    sum_x += jx;
                                    sum_y += jy;
                                    sum_z += jz;
                                    count += 1;
                                }
                            }
                        }
                    }
                }
            }
            
            // Apply smoothing if neighbors found (same as C++ WASM)
            if count > 0 {
                smoothed_points[i3] = (x + sum_x) / (count + 1) as f32;
                smoothed_points[i3 + 1] = (y + sum_y) / (count + 1) as f32;
                smoothed_points[i3 + 2] = (z + sum_z) / (count + 1) as f32;
            }
        }
    }
    
    console_log!("Rust WASM: O(n) spatial hashing point cloud smoothing completed");
    smoothed_points
}

