use wasm_bindgen::prelude::*;

#[macro_use]
mod common;
mod voxel_downsample;
mod point_cloud_smoothing;
mod voxel_debug;

use voxel_downsample::voxel_downsample_internal;
use point_cloud_smoothing::point_cloud_smooth_internal;
use voxel_debug::generate_voxel_centers_internal;

#[wasm_bindgen]
pub struct PointCloudToolsRust {
}

#[wasm_bindgen]
impl PointCloudToolsRust {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PointCloudToolsRust {
        console_log!("Rust WASM: PointCloudToolsRust initialized");
        PointCloudToolsRust {}
    }
    
    /// Get WASM memory for direct access
    #[wasm_bindgen]
    pub fn get_memory(&self) -> wasm_bindgen::prelude::JsValue {
        wasm_bindgen::memory()
    }

    /// Direct pointer-based voxel downsampling for zero-copy input access
    /// JavaScript allocates memory, copies input data, calls this function,
    /// then reads results from output buffer
    /// 
    /// Pointers are passed as usize (byte offsets into WASM linear memory)
    /// 
    /// # Safety
    /// This function uses `unsafe` Rust code to access memory directly via raw pointers.
    /// Rust cannot automatically verify that these pointers are valid, so we must ensure safety manually.
    /// The function validates inputs (alignment, point count, etc.), but the caller (JavaScript) must guarantee:
    /// - input_ptr points to valid WASM memory with at least point_count * 3 floats
    /// - output_ptr points to valid WASM memory with at least point_count * 3 floats
    /// - Both pointers are properly aligned (4-byte boundaries for floats)
    /// 
    /// When used correctly, this function is safe. The `unsafe` keyword is required because
    /// Rust's compiler cannot automatically verify memory safety with raw pointers.
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
            
            voxel_downsample_internal(
                points,
                voxel_size,
                min_x,
                min_y,
                min_z,
                output_ptr_f32,
            )
        }
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
        point_cloud_smooth_internal(points, smoothing_radius, iterations)
    }

    /// Generate voxel centers for debug visualization
    /// Returns unique voxel center positions for rendering wireframe cubes
    #[wasm_bindgen]
    pub fn generate_voxel_centers(
        &mut self,
        points: &[f32],
        voxel_size: f32,
        min_x: f32,
        min_y: f32,
        min_z: f32,
    ) -> Vec<f32> {
        generate_voxel_centers_internal(points, voxel_size, min_x, min_y, min_z)
    }
}
