use wasm_bindgen::prelude::*;
use std::collections::HashMap;

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

#[wasm_bindgen]
pub struct Voxel {
    count: i32,
    sum_x: f32,
    sum_y: f32,
    sum_z: f32,
}

impl Voxel {
    fn new() -> Voxel {
        Voxel {
            count: 0,
            sum_x: 0.0,
            sum_y: 0.0,
            sum_z: 0.0,
        }
    }

    fn add_point(&mut self, x: f32, y: f32, z: f32) {
        self.count += 1;
        self.sum_x += x;
        self.sum_y += y;
        self.sum_z += z;
    }

    fn get_average(&self) -> (f32, f32, f32) {
        if self.count > 0 {
            (
                self.sum_x / self.count as f32,
                self.sum_y / self.count as f32,
                self.sum_z / self.count as f32,
            )
        } else {
            (0.0, 0.0, 0.0)
        }
    }
}

#[wasm_bindgen]
pub struct PointCloudToolsRust {
    // Store voxel map for downsampling
    voxel_map: HashMap<String, Voxel>,
}

#[wasm_bindgen]
impl PointCloudToolsRust {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PointCloudToolsRust {
        console_log!("Rust WASM: PointCloudToolsRust initialized");
        PointCloudToolsRust {
            voxel_map: HashMap::new(),
        }
    }

    /// Voxel downsampling implementation in Rust - OPTIMIZED like point cloud smoothing
    /// Uses local hash map for maximum performance - same efficiency as point cloud smoothing
    #[wasm_bindgen]
    pub fn voxel_downsample(
        &self,
        points: &[f32],
        voxel_size: f32,
        min_x: f32,
        min_y: f32,
        min_z: f32,
    ) -> Vec<f32> {
        console_log!("🔧 RUST OPTIMIZED: Starting voxel downsampling with {} points, voxel_size: {}", 
                    points.len() / 3, voxel_size);
        console_log!("🔧 RUST OPTIMIZED: Bounds - min_x: {}, min_y: {}, min_z: {}", min_x, min_y, min_z);
        
        // Use local hash map with integer keys for maximum performance (like point cloud smoothing)
        let mut voxel_map: std::collections::HashMap<u64, Voxel> = std::collections::HashMap::new();
        
        // Process each point directly from memory
        for i in (0..points.len()).step_by(3) {
            if i + 2 < points.len() {
                let x = points[i];
                let y = points[i + 1];
                let z = points[i + 2];
                
                // Calculate voxel coordinates
                let voxel_x = ((x - min_x) / voxel_size).floor() as i32;
                let voxel_y = ((y - min_y) / voxel_size).floor() as i32;
                let voxel_z = ((z - min_z) / voxel_size).floor() as i32;
                
                // Create integer hash key - much faster than string
                let voxel_key = ((voxel_x as u64) << 32) |
                               ((voxel_y as u64) << 16) |
                               (voxel_z as u64);
                
                // Add point to voxel using integer key
                voxel_map
                    .entry(voxel_key)
                    .or_insert_with(Voxel::new)
                    .add_point(x, y, z);
            }
        }
        
        // Convert voxels to output points
        let mut result = Vec::new();
        for voxel in voxel_map.values() {
            let (avg_x, avg_y, avg_z) = voxel.get_average();
            result.push(avg_x);
            result.push(avg_y);
            result.push(avg_z);
        }
        
        console_log!("🔧 RUST OPTIMIZED: Voxel downsampling completed. {} input points -> {} output points", 
                    points.len() / 3, result.len() / 3);
        console_log!("🔧 RUST OPTIMIZED: Returning result with {} elements", result.len());
        
        result
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

    /// Generate voxel centers for debug visualization
    /// This matches the algorithm used in other implementations
    #[wasm_bindgen]
    pub fn generate_voxel_centers(
        &mut self,
        points: &[f32],
        voxel_size: f32,
        min_x: f32,
        min_y: f32,
        min_z: f32,
    ) -> Vec<f32> {
        console_log!("Rust WASM: Generating voxel centers for debug visualization");
        
        self.voxel_map.clear();
        
        // Process each point to build voxel map
        for i in (0..points.len()).step_by(3) {
            if i + 2 < points.len() {
                let x = points[i];
                let y = points[i + 1];
                let z = points[i + 2];
                
                // Calculate voxel coordinates
                let voxel_x = ((x - min_x) / voxel_size).floor() as i32;
                let voxel_y = ((y - min_y) / voxel_size).floor() as i32;
                let voxel_z = ((z - min_z) / voxel_size).floor() as i32;
                
                // Create voxel key
                let voxel_key = format!("{},{},{}", voxel_x, voxel_y, voxel_z);
                
                // Add point to voxel
                self.voxel_map
                    .entry(voxel_key)
                    .or_insert_with(Voxel::new)
                    .add_point(x, y, z);
            }
        }
        
        // Convert voxels to grid center positions (not averaged positions)
        let mut centers = Vec::new();
        for (voxel_key, _voxel) in &self.voxel_map {
            // Parse voxel key to get grid coordinates
            let parts: Vec<&str> = voxel_key.split(',').collect();
            if parts.len() == 3 {
                if let (Ok(voxel_x), Ok(voxel_y), Ok(voxel_z)) = 
                    (parts[0].parse::<i32>(), parts[1].parse::<i32>(), parts[2].parse::<i32>()) {
                    
                    // Calculate grid center position (same as C++ implementation)
                    let center_x = (voxel_x as f32 + 0.5) * voxel_size + min_x;
                    let center_y = (voxel_y as f32 + 0.5) * voxel_size + min_y;
                    let center_z = (voxel_z as f32 + 0.5) * voxel_size + min_z;
                    
                    centers.push(center_x);
                    centers.push(center_y);
                    centers.push(center_z);
                }
            }
        }
        
        console_log!("Rust WASM: Generated {} voxel centers", centers.len() / 3);
        centers
    }
}

