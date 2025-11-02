use std::collections::HashMap;
use std::io::{self, BufRead};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
struct InputData {
    point_cloud_data: Vec<f32>,
    voxel_size: f32,
    global_bounds: GlobalBounds,
}

#[derive(Debug, Deserialize)]
struct GlobalBounds {
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
}

#[derive(Debug, Serialize)]
struct OutputData {
    downsampled_points: Vec<f32>,
    original_count: usize,
    downsampled_count: usize,
    voxel_count: usize,  // Same as downsampled_count (each point = one voxel)
    processing_time: f64,
}

fn main() {
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();
    
    // Read input JSON from stdin
    let mut input_json = String::new();
    while let Some(line) = lines.next() {
        let line = line.unwrap();
        input_json.push_str(&line);
        if line.trim().ends_with('}') {
            break;
        }
    }
    
    // Parse input JSON
    let input: InputData = serde_json::from_str(&input_json)
        .expect("Failed to parse input JSON");
    
    let start_time = std::time::Instant::now();
    
    // Process voxel downsampling
    let downsampled_points = voxel_downsample(
        &input.point_cloud_data,
        input.voxel_size,
        &input.global_bounds,
    );
    
    let processing_time = start_time.elapsed().as_secs_f64() * 1000.0; // Convert to milliseconds
    
    // Prepare output - downsampled_count is number of points, not floats
    let downsampled_count = downsampled_points.len() / 3;
    let voxel_count = downsampled_count;  // Each downsampled point represents one voxel
    let output = OutputData {
        downsampled_points,
        original_count: input.point_cloud_data.len() / 3,
        downsampled_count,
        voxel_count,
        processing_time,
    };
    
    // Output result as JSON
    println!("{}", serde_json::to_string(&output).unwrap());
}

fn voxel_downsample(
    points: &[f32],
    voxel_size: f32,
    bounds: &GlobalBounds,
) -> Vec<f32> {
    let inv_voxel_size = 1.0 / voxel_size;
    
    // Use HashMap to group points by voxel
    let mut voxel_map: HashMap<u64, (f32, f32, f32, i32)> = HashMap::new();
    
    // Process points in chunks for better performance
    const CHUNK_SIZE: usize = 1000;
    for chunk in points.chunks(CHUNK_SIZE * 3) {
        for i in (0..chunk.len()).step_by(3) {
            if i + 2 < chunk.len() {
                let x = chunk[i];
                let y = chunk[i + 1];
                let z = chunk[i + 2];
                
                // Calculate voxel coordinates - use floor() to match TypeScript/Frontend Rust Math.floor()
                let voxel_x = ((x - bounds.min_x) * inv_voxel_size).floor() as i32;
                let voxel_y = ((y - bounds.min_y) * inv_voxel_size).floor() as i32;
                let voxel_z = ((z - bounds.min_z) * inv_voxel_size).floor() as i32;
                
                // Create voxel key using bit shifting for better performance
                let voxel_key = ((voxel_x as u64) << 32) | ((voxel_y as u64) << 16) | (voxel_z as u64);
                
                // Update voxel data - use and_modify pattern to match frontend Rust
                voxel_map.entry(voxel_key).and_modify(|(sum_x, sum_y, sum_z, count)| {
                    *sum_x += x;
                    *sum_y += y;
                    *sum_z += z;
                    *count += 1;
                }).or_insert((x, y, z, 1));
            }
        }
    }
    
    // Convert voxel data to downsampled points
    let mut downsampled_points = Vec::with_capacity(voxel_map.len() * 3);
    
    for (_, (sum_x, sum_y, sum_z, count)) in voxel_map {
        let avg_x = sum_x / count as f32;
        let avg_y = sum_y / count as f32;
        let avg_z = sum_z / count as f32;
        
        downsampled_points.push(avg_x);
        downsampled_points.push(avg_y);
        downsampled_points.push(avg_z);
    }
    
    downsampled_points
}
