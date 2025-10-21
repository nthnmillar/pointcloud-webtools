use std::io::{self, BufRead};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
struct InputData {
    point_cloud_data: Vec<f32>,
    smoothing_radius: f32,
    iterations: i32,
}

#[derive(Debug, Serialize)]
struct OutputData {
    smoothed_points: Vec<f32>,
    original_count: usize,
    smoothed_count: usize,
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
    
    // Process point cloud smoothing
    let smoothed_points = point_cloud_smooth(
        &input.point_cloud_data,
        input.smoothing_radius,
        input.iterations,
    );
    
    let processing_time = start_time.elapsed().as_secs_f64() * 1000.0; // Convert to milliseconds
    
    // Prepare output
    let smoothed_count = smoothed_points.len();
    let output = OutputData {
        smoothed_points,
        original_count: input.point_cloud_data.len() / 3,
        smoothed_count,
        processing_time,
    };
    
    // Output result as JSON
    println!("{}", serde_json::to_string(&output).unwrap());
}

fn point_cloud_smooth(
    points: &[f32],
    smoothing_radius: f32,
    iterations: i32,
) -> Vec<f32> {
    let mut smoothed_points = points.to_vec();
    let radius_squared = smoothing_radius * smoothing_radius;
    
    for _ in 0..iterations {
        let mut new_points = Vec::with_capacity(smoothed_points.len());
        
        for i in (0..smoothed_points.len()).step_by(3) {
            if i + 2 < smoothed_points.len() {
                let x = smoothed_points[i];
                let y = smoothed_points[i + 1];
                let z = smoothed_points[i + 2];
                
                let mut sum_x = 0.0;
                let mut sum_y = 0.0;
                let mut sum_z = 0.0;
                let mut count = 0;
                
                // Find nearby points within smoothing radius
                for j in (0..smoothed_points.len()).step_by(3) {
                    if j + 2 < smoothed_points.len() && j != i {
                        let other_x = smoothed_points[j];
                        let other_y = smoothed_points[j + 1];
                        let other_z = smoothed_points[j + 2];
                        
                        let dx = x - other_x;
                        let dy = y - other_y;
                        let dz = z - other_z;
                        let distance_squared = dx * dx + dy * dy + dz * dz;
                        
                        if distance_squared <= radius_squared {
                            sum_x += other_x;
                            sum_y += other_y;
                            sum_z += other_z;
                            count += 1;
                        }
                    }
                }
                
                // Calculate smoothed position
                if count > 0 {
                    let new_x = (x + sum_x) / (count + 1) as f32;
                    let new_y = (y + sum_y) / (count + 1) as f32;
                    let new_z = (z + sum_z) / (count + 1) as f32;
                    
                    new_points.push(new_x);
                    new_points.push(new_y);
                    new_points.push(new_z);
                } else {
                    // Keep original point if no neighbors found
                    new_points.push(x);
                    new_points.push(y);
                    new_points.push(z);
                }
            }
        }
        
        smoothed_points = new_points;
    }
    
    smoothed_points
}
