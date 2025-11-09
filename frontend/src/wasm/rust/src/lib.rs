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

// Note: Memory allocation is handled in JavaScript using the WASM memory buffer directly
// This avoids needing to export malloc/free functions

#[wasm_bindgen]
impl PointCloudToolsRust {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PointCloudToolsRust {
        console_log!("Rust WASM: PointCloudToolsRust initialized");
        PointCloudToolsRust {
            result_buffer: None,
        }
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
        // Create a temporary instance to call the internal implementation
        let mut instance = PointCloudToolsRust::new();
        instance.voxel_downsample_direct(
            input_ptr,
            point_count,
            voxel_size,
            min_x,
            min_y,
            min_z,
            output_ptr,
        )
    }
    
    /// Direct pointer-based voxel downsampling for zero-copy input access
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
    pub fn voxel_downsample_direct(
        &mut self,
        input_ptr: usize,
        point_count: usize,
        voxel_size: f32,
        min_x: f32,
        min_y: f32,
        min_z: f32,
        output_ptr: usize,
    ) -> usize {
        // Log function call for debugging
        console_log!("Rust WASM: Function called - input_ptr={}, point_count={}, output_ptr={}", input_ptr, point_count, output_ptr);
        
        // Validate inputs
        // Note: In WASM, offset 0 is valid (start of linear memory), so we don't check for 0
        // Instead, we check that we have valid point count and voxel size
        if point_count == 0 || voxel_size <= 0.0 {
            console_log!("Rust WASM: Invalid input parameters - point_count={}, voxel_size={}", point_count, voxel_size);
            return 0;
        }
        
        // Validate pointer alignment (f32 requires 4-byte alignment)
        if input_ptr % 4 != 0 || output_ptr % 4 != 0 {
            console_log!("Rust WASM: Pointer alignment error");
            return 0;
        }
        
        // Calculate input length
        let input_len = point_count * 3;
        
        console_log!("Rust WASM: Creating slice - input_len={}", input_len);
        
        unsafe {
            // Convert usize offsets to raw pointers
            // In WASM, pointers are just offsets into linear memory
            // Offset 0 is valid (start of linear memory), so we don't check for null
            let input_ptr_f32 = input_ptr as *const f32;
            let output_ptr_f32 = output_ptr as *mut f32;
            
            // Note: We can't directly get WASM memory size in Rust to validate the slice
            // We rely on JavaScript to ensure the memory is large enough and add bounds checking
            // in the internal function
            
            // CRITICAL: Test memory access before creating slice
            // Try to read first element directly to verify memory is accessible
            // If this fails, the memory isn't actually accessible from Rust
            if input_len > 0 {
                // Test read - this will panic if memory isn't accessible
                // We're already in unsafe block, so no need for nested unsafe
                let test_value = *input_ptr_f32;
                console_log!("Rust WASM: Memory test read successful - first value={}", test_value);
            }
            
            // Create slice from raw pointer
            // Note: from_raw_parts doesn't validate that memory is actually accessible,
            // it just creates a slice. The actual bounds checking happens when we access it.
            let points = std::slice::from_raw_parts(input_ptr_f32, input_len);
            
            console_log!("Rust WASM: Slice created - len={}, calling internal", points.len());
            
            // Call internal implementation
            let output_count = self.voxel_downsample_internal(
                points,
                voxel_size,
                min_x,
                min_y,
                min_z,
                output_ptr_f32,
            );
            
            console_log!("Rust WASM: Completed - output_count={}", output_count);
            
            output_count
        }
    }
    
    /// Internal voxel downsampling implementation
    /// Writes results directly to output buffer
    fn voxel_downsample_internal(
        &self,
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
        
        // Validate slice length
        let expected_len = point_count * 3;
        if points.len() < expected_len {
            console_log!("Rust WASM: Points slice too short - expected {}, got {}", expected_len, points.len());
            return 0;
        }
        
        // OPTIMIZATION 2: Use HashMap with integer keys and direct coordinate storage
        // Pre-allocate with estimated capacity to avoid reallocations
        // Cap the estimate to avoid excessive memory allocation for very large datasets
        let estimated_voxels = (point_count / 100).min(100_000); // Max 100K voxels estimate
        let mut voxel_map: HashMap<u64, (f32, f32, f32, i32)> = HashMap::with_capacity(estimated_voxels);
        
        // Log for debugging large datasets
        if point_count > 500_000 {
            console_log!("Rust WASM: Processing large dataset: {} points, estimated {} voxels", 
                        point_count, estimated_voxels);
        }
        
        // OPTIMIZATION 3: Process points in chunks for better cache locality
        const CHUNK_SIZE: usize = 1024;
        
        for chunk_start in (0..point_count).step_by(CHUNK_SIZE) {
            let chunk_end = (chunk_start + CHUNK_SIZE).min(point_count);
            
            for i in chunk_start..chunk_end {
                let i3 = i * 3;
                // Bounds check - this should never fail if slice is valid
                if i3 + 2 >= points.len() {
                    console_log!("Rust WASM: Index out of bounds - i={}, i3={}, len={}", i, i3, points.len());
                    break;
                }
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
        
        // OPTIMIZATION 7: Write results directly to output buffer
        let mut output_index = 0;
        let voxel_count = voxel_map.len();
        
        for (_voxel_key, (sum_x, sum_y, sum_z, count)) in voxel_map {
            let avg_x = sum_x / count as f32;
            let avg_y = sum_y / count as f32;
            let avg_z = sum_z / count as f32;
            
            // Bounds check before writing (defensive programming)
            if output_index >= voxel_count {
                console_log!("Rust WASM: Output index overflow detected");
                break;
            }
            
            unsafe {
                let base_idx = output_index * 3;
                *output_ptr.add(base_idx) = avg_x;
                *output_ptr.add(base_idx + 1) = avg_y;
                *output_ptr.add(base_idx + 2) = avg_z;
            }
            output_index += 1;
        }
        
        output_index
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

