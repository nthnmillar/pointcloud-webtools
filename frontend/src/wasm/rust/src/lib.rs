use wasm_bindgen::prelude::*;
use rustc_hash::{FxHashMap, FxHashSet};

// Voxel struct for better cache locality (matches C++ implementation)
#[derive(Clone, Copy)]
struct Voxel {
    count: i32,
    sum_x: f32,
    sum_y: f32,
    sum_z: f32,
}

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
}

// Note: Memory allocation is handled in JavaScript using the WASM memory buffer directly
// This avoids needing to export malloc/free functions

#[wasm_bindgen]
impl PointCloudToolsRust {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PointCloudToolsRust {
        console_log!("Rust WASM: PointCloudToolsRust initialized");
        PointCloudToolsRust {}
    }
    
    /// Get WASM memory for direct access
    #[wasm_bindgen]
    pub fn get_memory(&self) -> wasm_bindgen::JsValue {
        wasm_bindgen::memory()
    }

    /// Direct pointer-based voxel downsampling for zero-copy input access (static version)
    /// JavaScript allocates memory, copies input data, calls this function,
    /// then reads results from output buffer
    /// 
    /// Pointers are passed as usize (byte offsets into WASM linear memory)
    /// 
    /// # Safety
    /// This function is unsafe because it reads from raw pointers.
    /// The caller must ensure:
    /// - input_ptr points to valid WASM memory with at least point_count * 3 floats
    /// - output_ptr points to valid WASM memory with at least point_count * 3 floats
    /// - Both pointers are properly aligned
    #[wasm_bindgen]
    pub fn voxel_downsample_direct_static(
        input_ptr: usize,
        point_count: usize,
        voxel_size: f32,
        min_x: f32,
        min_y: f32,
        min_z: f32,
        output_ptr: usize,
    ) -> usize {
        if point_count == 0 || voxel_size <= 0.0 {
            return 0;
        }
        
        if input_ptr % 4 != 0 || output_ptr % 4 != 0 {
            return 0;
        }
        
        let input_len = point_count * 3;
        
        unsafe {
            let input_ptr_f32 = input_ptr as *const f32;
            let output_ptr_f32 = output_ptr as *mut f32;
            let points = std::slice::from_raw_parts(input_ptr_f32, input_len);
            
            Self::voxel_downsample_internal(
                points,
                voxel_size,
                min_x,
                min_y,
                min_z,
                output_ptr_f32,
            )
        }
    }
    
    /// Internal voxel downsampling implementation
    /// Writes results directly to output buffer
    fn voxel_downsample_internal(
        points: &[f32],
        voxel_size: f32,
        min_x: f32,
        min_y: f32,
        min_z: f32,
        output_ptr: *mut f32,
    ) -> usize {
        // OPTIMIZATION 1: Pre-calculate inverse voxel size to avoid division
        let inv_voxel_size = 1.0 / voxel_size;
        
        // Calculate point count first
        let point_count = points.len() / 3;
        
        // Validate slice length (minimal check)
        if points.len() < point_count * 3 {
            return 0;
        }
        
        // OPTIMIZATION 2: Use FxHashMap (much faster hash for integer keys) with struct for better cache locality
        // Pre-allocate with estimated capacity to avoid reallocations
        let estimated_voxels = (point_count / 100).min(100_000);
        let mut voxel_map: FxHashMap<u64, Voxel> = FxHashMap::with_capacity_and_hasher(estimated_voxels, Default::default());
        
        // OPTIMIZATION 3: Process points in chunks for better cache locality
        const CHUNK_SIZE: usize = 1024;
        
        for chunk_start in (0..point_count).step_by(CHUNK_SIZE) {
            let chunk_end = (chunk_start + CHUNK_SIZE).min(point_count);
            
            for i in chunk_start..chunk_end {
                let i3 = i * 3;
                // Remove bounds check - slice is already validated, compiler can optimize better
                let x = points[i3];
                let y = points[i3 + 1];
                let z = points[i3 + 2];
                
                // OPTIMIZATION 4: Use multiplication instead of division
                let voxel_x = ((x - min_x) * inv_voxel_size).floor() as i32;
                let voxel_y = ((y - min_y) * inv_voxel_size).floor() as i32;
                let voxel_z = ((z - min_z) * inv_voxel_size).floor() as i32;
                
                // OPTIMIZATION 5: Use integer hash key
                let voxel_key = ((voxel_x as u64) << 32) | ((voxel_y as u64) << 16) | (voxel_z as u64);
                
                // OPTIMIZATION 6: Use entry() API (like C++ try_emplace) - single hash lookup
                // Use struct for better cache locality (matches C++ implementation)
                voxel_map.entry(voxel_key).and_modify(|voxel| {
                    voxel.count += 1;
                    voxel.sum_x += x;
                    voxel.sum_y += y;
                    voxel.sum_z += z;
                }).or_insert(Voxel {
                    count: 1,
                    sum_x: x,
                    sum_y: y,
                    sum_z: z,
                });
            }
        }
        
        // OPTIMIZATION 7: Write results directly to output buffer (matches C++ pattern)
        let mut output_index = 0;
        
        for (_voxel_key, voxel) in voxel_map {
            let count_f = voxel.count as f32;
            unsafe {
                let base_idx = output_index * 3;
                *output_ptr.add(base_idx) = voxel.sum_x / count_f;
                *output_ptr.add(base_idx + 1) = voxel.sum_y / count_f;
                *output_ptr.add(base_idx + 2) = voxel.sum_z / count_f;
            }
            output_index += 1;
        }
        
        output_index
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
        
        // OPTIMIZATION 2: Use FxHashSet with integer keys (much faster than tuple keys!)
        // Integer keys are faster to hash than tuples (same optimization as downsampling)
        let mut voxel_keys: FxHashSet<u64> = FxHashSet::default();
        
        // OPTIMIZATION 3: Process points in chunks for better cache locality (same as downsampling)
        const CHUNK_SIZE: usize = 1024;
        let point_count = points.len() / 3;
        
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
                
                // OPTIMIZATION 5: Use integer hash key (same as downsampling - much faster than tuple!)
                let voxel_key = ((voxel_x as u64) << 32) | ((voxel_y as u64) << 16) | (voxel_z as u64);
                
                voxel_keys.insert(voxel_key);
            }
        }
        
        // OPTIMIZATION 6: Pre-allocate result vector with exact capacity
        let voxel_count = voxel_keys.len();
        let mut centers = Vec::with_capacity(voxel_count * 3);
        
        // OPTIMIZATION 7: Single pass conversion with direct grid position calculation
        for voxel_key in voxel_keys {
            // Extract voxel coordinates from integer key (same as C++/backend)
            let voxel_x = (voxel_key >> 32) as i32;
            let voxel_y = ((voxel_key >> 16) & 0xFFFF) as i16 as i32; // Sign-extend 16-bit
            let voxel_z = (voxel_key & 0xFFFF) as i16 as i32; // Sign-extend 16-bit
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

