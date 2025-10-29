use std::collections::HashSet;
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
    voxel_grid_positions: Vec<f32>,
    voxel_count: usize,
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
    
    // Process voxel debug generation
    let voxel_grid_positions = generate_voxel_centers(
        &input.point_cloud_data,
        input.voxel_size,
        &input.global_bounds,
    );
    
    let processing_time = start_time.elapsed().as_secs_f64() * 1000.0; // Convert to milliseconds
    
    // Prepare output
    let voxel_count = voxel_grid_positions.len() / 3;
    let output = OutputData {
        voxel_grid_positions,
        voxel_count,
        processing_time,
    };
    
    // Output result as JSON
    println!("{}", serde_json::to_string(&output).unwrap());
}

fn generate_voxel_centers(
    points: &[f32],
    voxel_size: f32,
    bounds: &GlobalBounds,
) -> Vec<f32> {
    let inv_voxel_size = 1.0 / voxel_size;
    let half_voxel_size = voxel_size * 0.5;
    
    // Calculate offsets to match TypeScript implementation
    let offset_x = bounds.min_x + half_voxel_size;
    let offset_y = bounds.min_y + half_voxel_size;
    let offset_z = bounds.min_z + half_voxel_size;
    
    // Use HashSet to store unique voxel coordinates
    let mut voxel_coords: HashSet<(i32, i32, i32)> = HashSet::new();
    
    // Process points in chunks for better performance
    const CHUNK_SIZE: usize = 1000;
    for chunk in points.chunks(CHUNK_SIZE * 3) {
        for i in (0..chunk.len()).step_by(3) {
            if i + 2 < chunk.len() {
                let x = chunk[i];
                let y = chunk[i + 1];
                let z = chunk[i + 2];
                
                // Calculate voxel coordinates to match TypeScript: Math.floor((x - minX) * invVoxelSize)
                let voxel_x = ((x - bounds.min_x) * inv_voxel_size).floor() as i32;
                let voxel_y = ((y - bounds.min_y) * inv_voxel_size).floor() as i32;
                let voxel_z = ((z - bounds.min_z) * inv_voxel_size).floor() as i32;
                
                voxel_coords.insert((voxel_x, voxel_y, voxel_z));
            }
        }
    }
    
    // Convert voxel coordinates to grid positions
    let mut voxel_grid_positions = Vec::with_capacity(voxel_coords.len() * 3);
    
    for (voxel_x, voxel_y, voxel_z) in voxel_coords {
        // Convert voxel coordinates back to world coordinates to match TypeScript: offsetX + voxelX * voxelSize
        let center_x = offset_x + voxel_x as f32 * voxel_size;
        let center_y = offset_y + voxel_y as f32 * voxel_size;
        let center_z = offset_z + voxel_z as f32 * voxel_size;
        
        voxel_grid_positions.push(center_x);
        voxel_grid_positions.push(center_y);
        voxel_grid_positions.push(center_z);
    }
    
    voxel_grid_positions
}
