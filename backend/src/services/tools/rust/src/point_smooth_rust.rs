use std::io::{self, Read, Write};

// Binary protocol for fast I/O (replaces JSON)
// Input format: [u32 pointCount][f32 smoothingRadius][f32 iterations][f32* pointData]
// Output format: [u32 pointCount][f32* smoothedPoints]

fn main() {
    // OPTIMIZATION: Read binary input instead of JSON (much faster!)
    // Binary format: [u32 pointCount][f32 smoothingRadius][f32 iterations][f32* pointData]
    
    let mut stdin = io::stdin();
    
    // Read binary header (12 bytes: 4 for u32 + 4 for f32 + 4 for f32)
    let mut header = [0u8; 12];
    if stdin.read_exact(&mut header).is_err() {
        std::process::exit(1);
    }
    
    let point_count = u32::from_le_bytes([header[0], header[1], header[2], header[3]]) as usize;
    let smoothing_radius = f32::from_le_bytes([header[4], header[5], header[6], header[7]]);
    let iterations = f32::from_le_bytes([header[8], header[9], header[10], header[11]]) as i32;
    
    // Validate input
    if point_count == 0 || smoothing_radius <= 0.0 || iterations <= 0 {
        // Write empty result (4 bytes: pointCount = 0)
        let output_count: u32 = 0;
        let mut stdout = io::stdout();
        if stdout.write_all(&output_count.to_le_bytes()).is_err() || stdout.flush().is_err() {
            std::process::exit(1);
        }
        return;
    }
    
    // Read point data directly into vector (optimized binary read)
    let float_count = point_count * 3;
    let bytes_to_read = float_count * 4;
    let mut buffer = vec![0u8; bytes_to_read];
    
    if stdin.read_exact(&mut buffer).is_err() {
        std::process::exit(1);
    }
    
    // Convert bytes to floats (little-endian) - optimized conversion
    let point_cloud_data: Vec<f32> = buffer
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();
    
    // Process point cloud smoothing
    let smoothed_points = point_cloud_smooth(
        &point_cloud_data,
        smoothing_radius,
        iterations,
    );
    
    // OPTIMIZATION: Write binary output instead of JSON (much faster!)
    // Binary format: [u32 pointCount][f32* smoothedPoints]
    
    let mut stdout = io::stdout();
    
    // Write output count (4 bytes)
    let output_count = smoothed_points.len() / 3;
    if stdout.write_all(&(output_count as u32).to_le_bytes()).is_err() {
        std::process::exit(1);
    }
    
    // Write smoothed points directly (binary, no serialization overhead!)
    let bytes: Vec<u8> = smoothed_points
        .iter()
        .flat_map(|&f| f.to_le_bytes().into_iter())
        .collect();
    if stdout.write_all(&bytes).is_err() || stdout.flush().is_err() {
        std::process::exit(1);
    }
}

fn point_cloud_smooth(
    points: &[f32],
    smoothing_radius: f32,
    iterations: i32,
) -> Vec<f32> {
    // OPTIMIZATION: Use O(n) spatial hashing algorithm (same as Rust WASM)
    let point_count = points.len() / 3;
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
    
    for i in (0..points.len()).step_by(3) {
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
    
    // Hash function to get grid index (same as Rust WASM)
    let get_grid_index = |x: f32, y: f32, z: f32| -> i32 {
        let gx = ((x - min_x) * inv_cell_size) as i32;
        let gy = ((y - min_y) * inv_cell_size) as i32;
        let gz = ((z - min_z) * inv_cell_size) as i32;
        gx + gy * grid_width as i32 + gz * grid_width as i32 * grid_height as i32
    };
    
    // Smoothing iterations using spatial hashing (same as Rust WASM)
    for _iter in 0..iterations {
        // Copy current state to temp buffer
        let temp_points = smoothed_points.clone();
        
        // Clear grid efficiently
        for cell in &mut grid {
            cell.clear();
        }
        
        // Populate grid with PREVIOUS iteration's point positions
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
        
        // Process each point using spatial hash
        for i in 0..point_count {
            let i3 = i * 3;
            let x = temp_points[i3];
            let y = temp_points[i3 + 1];
            let z = temp_points[i3 + 2];
            
            let mut sum_x = 0.0;
            let mut sum_y = 0.0;
            let mut sum_z = 0.0;
            let mut count = 0;
            
            // Check neighboring grid cells (3x3x3 = 27 cells) - same as Rust WASM
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
            
            // Apply smoothing if neighbors found
            if count > 0 {
                let new_x = (x + sum_x) / (count + 1) as f32;
                let new_y = (y + sum_y) / (count + 1) as f32;
                let new_z = (z + sum_z) / (count + 1) as f32;
                
                smoothed_points[i3] = new_x;
                smoothed_points[i3 + 1] = new_y;
                smoothed_points[i3 + 2] = new_z;
            }
        }
    }
    
    smoothed_points
}
