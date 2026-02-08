// Voxel struct for better cache locality (matches C++ implementation)
#[derive(Clone, Copy)]
pub struct Voxel {
    pub count: i32,
    pub sum_x: f32,
    pub sum_y: f32,
    pub sum_z: f32,
}

// Full voxel for downsampling with optional colors, intensity, classification
#[derive(Clone)]
pub struct VoxelFull {
    pub count: i32,
    pub sum_x: f32,
    pub sum_y: f32,
    pub sum_z: f32,
    pub sum_r: f32,
    pub sum_g: f32,
    pub sum_b: f32,
    pub sum_intensity: f32,
    pub class_counts: rustc_hash::FxHashMap<u8, i32>,
}

// Import the `console.log` function from the browser
#[wasm_bindgen::prelude::wasm_bindgen]
extern "C" {
    #[wasm_bindgen::prelude::wasm_bindgen(js_namespace = console)]
    pub fn log(s: &str);
}

// Define a macro to make console.log work like in JavaScript
#[macro_export]
macro_rules! console_log {
    ($($t:tt)*) => ($crate::common::log(&format_args!($($t)*).to_string()))
}

