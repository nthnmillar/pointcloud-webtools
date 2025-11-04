use wasm_bindgen::prelude::*;
use std::collections::{HashMap, HashSet};
use js_sys::Float32Array;

// Import the `console.log` function from the browser
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Define a macro to make console.log work like in JavaScript
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

// Voxel struct removed - using direct integer hashing for better performance

#[wasm_bindgen]
pub struct PointCloudToolsRust {
    // Store result vectors to keep WASM memory alive for zero-copy views
    // This allows Float32Array::view() to work without copying
    result_buffer: Option<Vec<f32>>,
}

#[wasm_bindgen]
impl PointCloudToolsRust {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PointCloudToolsRust {
        console_log!("Rust WASM: PointCloudToolsRust initialized");
        PointCloudToolsRust {
            result_buffer: None,
        }
    }

    /// Voxel downsampling implementation in Rust - MAXIMUM OPTIMIZATION
    /// Uses direct memory access and integer hashing for maximum performance
    /// Returns Float32Array directly for zero-copy access
    #[wasm_bindgen]
    pub fn voxel_downsample(
        &mut self,
        points: &[f32],
        voxel_size: f32,
        min_x: f32,
        min_y: f32,
        min_z: f32,
    ) -> Float32Array {
        // OPTIMIZATION 1: Pre-calculate inverse voxel size to avoid division
        let inv_voxel_size = 1.0 / voxel_size;
        
        // Calculate point count first
        let point_count = points.len() / 3;
        
        // OPTIMIZATION 2: Use HashMap with integer keys and direct coordinate storage
        // Pre-allocate with estimated capacity to avoid reallocations
        let estimated_voxels = point_count / 100; // Rough estimate: ~1% of points become voxels
        let mut voxel_map: HashMap<u64, (f32, f32, f32, i32)> = HashMap::with_capacity(estimated_voxels);
        
        // OPTIMIZATION 3: Process points in chunks for better cache locality
        const CHUNK_SIZE: usize = 1024;
        
        for chunk_start in (0..point_count).step_by(CHUNK_SIZE) {
            let chunk_end = (chunk_start + CHUNK_SIZE).min(point_count);
            
            for i in chunk_start..chunk_end {
                let i3 = i * 3;
                let x = points[i3];
                let y = points[i3 + 1];
                let z = points[i3 + 2];
                
                // OPTIMIZATION 4: Use multiplication instead of division
                let voxel_x = ((x - min_x) * inv_voxel_size).floor() as i32;
                let voxel_y = ((y - min_y) * inv_voxel_size).floor() as i32;
                let voxel_z = ((z - min_z) * inv_voxel_size).floor() as i32;
                
                // OPTIMIZATION 5: Use integer hash key (same as debug implementation)
                let voxel_key = ((voxel_x as u64) << 32) | ((voxel_y as u64) << 16) | (voxel_z as u64);
                
                // OPTIMIZATION 6: Store sums directly (no coordinate storage needed for downsampling)
                voxel_map.entry(voxel_key).and_modify(|(sum_x, sum_y, sum_z, count)| {
                    *sum_x += x;
                    *sum_y += y;
                    *sum_z += z;
                    *count += 1;
                }).or_insert((x, y, z, 1));
            }
        }
        
        // OPTIMIZATION 7: Pre-allocate result vector
        let voxel_count = voxel_map.len();
        let mut result = Vec::with_capacity(voxel_count * 3);
        
        // OPTIMIZATION 8: Single pass conversion with direct average calculation
        for (_voxel_key, (sum_x, sum_y, sum_z, count)) in voxel_map {
            let avg_x = sum_x / count as f32;
            let avg_y = sum_y / count as f32;
            let avg_z = sum_z / count as f32;
            
            result.push(avg_x);
            result.push(avg_y);
            result.push(avg_z);
        }
        
        // OPTIMIZATION 9: Return Float32Array using memory view (zero-copy)
        // Store Vec in struct to keep WASM memory alive, then create view
        // This avoids copying data from WASM memory to JS memory
        let js_array = unsafe {
            Float32Array::view(&result)
        };
        
        // Store the Vec to keep memory alive - the view references it
        // Note: This means the Vec stays in memory until next call
        // For single-use cases, this is fine
        self.result_buffer = Some(result);
        
        js_array
    }

    /// Point cloud smoothing implementation in Rust
    /// This matches the algorithm used in TS, WASM C++, and BE C++
    #[wasm_bindgen]
    pub fn point_cloud_smooth(
        &self,
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

    /// Generate voxel centers for debug visualization - MAXIMUM OPTIMIZATION
    /// Uses direct memory access, integer hashing, and zero-copy operations
    #[wasm_bindgen]
    pub fn generate_voxel_centers(
        &mut self,
        points: &[f32],
        voxel_size: f32,
        min_x: f32,
        min_y: f32,
        min_z: f32,
    ) -> Vec<f32> {
        // OPTIMIZATION 1: Pre-calculate all constants to avoid repeated calculations
        let inv_voxel_size = 1.0 / voxel_size;
        let half_voxel_size = voxel_size * 0.5;
        let offset_x = min_x + half_voxel_size;
        let offset_y = min_y + half_voxel_size;
        let offset_z = min_z + half_voxel_size;
        
        // OPTIMIZATION 2: Use HashSet for unique voxel coordinates (faster than HashMap for this use case)
        let mut voxel_coords: HashSet<(i32, i32, i32)> = HashSet::new();
        
        // OPTIMIZATION 3: Process points in chunks with unrolled inner loop
        const CHUNK_SIZE: usize = 1024;
        let point_count = points.len() / 3;
        
        for chunk_start in (0..point_count).step_by(CHUNK_SIZE) {
            let chunk_end = (chunk_start + CHUNK_SIZE).min(point_count);
            
            // OPTIMIZATION 4: Unrolled loop for better performance
            for i in chunk_start..chunk_end {
                let i3 = i * 3;
                let x = points[i3];
                let y = points[i3 + 1];
                let z = points[i3 + 2];
                
                // OPTIMIZATION 5: Use multiplication instead of division (same as C++/TS)
                let voxel_x = ((x - min_x) * inv_voxel_size).floor() as i32;
                let voxel_y = ((y - min_y) * inv_voxel_size).floor() as i32;
                let voxel_z = ((z - min_z) * inv_voxel_size).floor() as i32;
                
                // OPTIMIZATION 6: Direct coordinate storage (no hashing needed for debug)
                voxel_coords.insert((voxel_x, voxel_y, voxel_z));
            }
        }
        
        // OPTIMIZATION 7: Pre-allocate result vector with exact capacity
        let voxel_count = voxel_coords.len();
        let mut centers = Vec::with_capacity(voxel_count * 3);
        
        // OPTIMIZATION 8: Single pass conversion with direct grid position calculation
        for (voxel_x, voxel_y, voxel_z) in voxel_coords {
            // Calculate grid center position (exact same as C++/TS implementation)
            let center_x = offset_x + voxel_x as f32 * voxel_size;
            let center_y = offset_y + voxel_y as f32 * voxel_size;
            let center_z = offset_z + voxel_z as f32 * voxel_size;
            
            centers.push(center_x);
            centers.push(center_y);
            centers.push(center_z);
        }
        
        centers
    }
}

