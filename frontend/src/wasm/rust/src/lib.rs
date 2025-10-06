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
    sum_x: f64,
    sum_y: f64,
    sum_z: f64,
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

    fn add_point(&mut self, x: f64, y: f64, z: f64) {
        self.count += 1;
        self.sum_x += x;
        self.sum_y += y;
        self.sum_z += z;
    }

    fn get_average(&self) -> (f64, f64, f64) {
        if self.count > 0 {
            (
                self.sum_x / self.count as f64,
                self.sum_y / self.count as f64,
                self.sum_z / self.count as f64,
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

    /// Voxel downsampling implementation in Rust
    /// This matches the algorithm used in TS, WASM C++, and BE C++
    #[wasm_bindgen]
    pub fn voxel_downsample(
        &mut self,
        points: &[f64],
        voxel_size: f64,
        min_x: f64,
        min_y: f64,
        min_z: f64,
    ) -> Vec<f64> {
        console_log!("🔧 RUST CODE: Starting voxel downsampling with {} points, voxel_size: {}", 
                    points.len() / 3, voxel_size);
        console_log!("🔧 RUST CODE: Bounds - min_x: {}, min_y: {}, min_z: {}", min_x, min_y, min_z);
        
        self.voxel_map.clear();
        
        // Process each point
        for i in (0..points.len()).step_by(3) {
            if i + 2 < points.len() {
                let x = points[i];
                let y = points[i + 1];
                let z = points[i + 2];
                
                // Calculate voxel coordinates (same algorithm as other implementations)
                let voxel_x = ((x - min_x) / voxel_size).floor() as i32;
                let voxel_y = ((y - min_y) / voxel_size).floor() as i32;
                let voxel_z = ((z - min_z) / voxel_size).floor() as i32;
                
                // Create voxel key (same format as other implementations)
                let voxel_key = format!("{},{}", voxel_x, voxel_y);
                let voxel_key = format!("{},{}", voxel_key, voxel_z);
                
                // Add point to voxel
                self.voxel_map
                    .entry(voxel_key)
                    .or_insert_with(Voxel::new)
                    .add_point(x, y, z);
            }
        }
        
        // Convert voxels to output points
        let mut result = Vec::new();
        for voxel in self.voxel_map.values() {
            let (avg_x, avg_y, avg_z) = voxel.get_average();
            result.push(avg_x);
            result.push(avg_y);
            result.push(avg_z);
        }
        
        console_log!("🔧 RUST CODE: Voxel downsampling completed. {} input points -> {} output points", 
                    points.len() / 3, result.len() / 3);
        console_log!("🔧 RUST CODE: First few result points: {:?}", &result[0..std::cmp::min(9, result.len())]);
        
        result
    }

    /// Point cloud smoothing implementation in Rust
    /// This matches the algorithm used in TS, WASM C++, and BE C++
    #[wasm_bindgen]
    pub fn point_cloud_smooth(
        &self,
        points: &[f64],
        smoothing_radius: f64,
        iterations: i32,
    ) -> Vec<f64> {
        console_log!("Rust WASM: Starting point cloud smoothing with {} points, radius: {}, iterations: {}", 
                    points.len() / 3, smoothing_radius, iterations);
        
        let mut smoothed_points = points.to_vec();
        
        for iteration in 0..iterations {
            let mut new_points = smoothed_points.clone();
            
            for i in (0..points.len()).step_by(3) {
                if i + 2 < points.len() {
                    let current_x = smoothed_points[i];
                    let current_y = smoothed_points[i + 1];
                    let current_z = smoothed_points[i + 2];
                    
                    let mut neighbor_count = 0;
                    let mut sum_x = current_x;
                    let mut sum_y = current_y;
                    let mut sum_z = current_z;
                    
                    // Find neighbors within smoothing radius
                    for j in (0..points.len()).step_by(3) {
                        if j != i && j + 2 < points.len() {
                            let neighbor_x = smoothed_points[j];
                            let neighbor_y = smoothed_points[j + 1];
                            let neighbor_z = smoothed_points[j + 2];
                            
                            let distance = ((current_x - neighbor_x).powi(2) + 
                                          (current_y - neighbor_y).powi(2) + 
                                          (current_z - neighbor_z).powi(2)).sqrt();
                            
                            if distance <= smoothing_radius {
                                sum_x += neighbor_x;
                                sum_y += neighbor_y;
                                sum_z += neighbor_z;
                                neighbor_count += 1;
                            }
                        }
                    }
                    
                    // Apply smoothing (same formula as other implementations)
                    if neighbor_count > 0 {
                        new_points[i] = sum_x / (neighbor_count + 1) as f64;
                        new_points[i + 1] = sum_y / (neighbor_count + 1) as f64;
                        new_points[i + 2] = sum_z / (neighbor_count + 1) as f64;
                    }
                }
            }
            
            smoothed_points = new_points;
        }
        
        console_log!("Rust WASM: Point cloud smoothing completed");
        smoothed_points
    }

    /// Generate voxel centers for debug visualization
    /// This matches the algorithm used in other implementations
    #[wasm_bindgen]
    pub fn generate_voxel_centers(
        &mut self,
        points: &[f64],
        voxel_size: f64,
        min_x: f64,
        min_y: f64,
        min_z: f64,
    ) -> Vec<f64> {
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
                    let center_x = (voxel_x as f64 + 0.5) * voxel_size + min_x;
                    let center_y = (voxel_y as f64 + 0.5) * voxel_size + min_y;
                    let center_z = (voxel_z as f64 + 0.5) * voxel_size + min_z;
                    
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

