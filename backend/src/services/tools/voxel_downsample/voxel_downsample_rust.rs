use std::io::{self, Read, Write};
use rustc_hash::FxHashMap;

// Binary protocol for fast I/O (replaces JSON)
// Input format: [u32 pointCount][f32 voxelSize][f32 minX][f32 minY][f32 minZ][f32 maxX][f32 maxY][f32 maxZ][f32* pointData]
// Output format: [u32 outputCount][f32* downsampledPoints]

// OPTIMIZATION: Use struct instead of tuple for better cache locality (matches WASM implementation)
#[derive(Clone, Copy)]
struct Voxel {
    count: i32,
    sum_x: f32,
    sum_y: f32,
    sum_z: f32,
}

fn main() {
    // OPTIMIZATION: Read binary input instead of JSON (much faster!)
    // Binary format: [u32 pointCount][f32 voxelSize][f32 minX][f32 minY][f32 minZ][f32 maxX][f32 maxY][f32 maxZ][f32* pointData]
    
    let mut stdin = io::stdin();
    
    // Read binary header (32 bytes: 4 for u32 + 7*4 for floats)
    let mut header = [0u8; 32];
    if stdin.read_exact(&mut header).is_err() {
        std::process::exit(1);
    }
    
    let point_count = u32::from_le_bytes([header[0], header[1], header[2], header[3]]) as usize;
    let voxel_size = f32::from_le_bytes([header[4], header[5], header[6], header[7]]);
    let min_x = f32::from_le_bytes([header[8], header[9], header[10], header[11]]);
    let min_y = f32::from_le_bytes([header[12], header[13], header[14], header[15]]);
    let min_z = f32::from_le_bytes([header[16], header[17], header[18], header[19]]);
    let _max_x = f32::from_le_bytes([header[20], header[21], header[22], header[23]]);
    let _max_y = f32::from_le_bytes([header[24], header[25], header[26], header[27]]);
    let _max_z = f32::from_le_bytes([header[28], header[29], header[30], header[31]]);
    
    // Validate input
    if point_count == 0 || voxel_size <= 0.0 {
        // Write empty result (4 bytes: outputCount = 0)
        let output_count: u32 = 0;
        let mut stdout = io::stdout();
        if stdout.write_all(&output_count.to_le_bytes()).is_err() || stdout.flush().is_err() {
            std::process::exit(1);
        }
        return;
    }
    
    // Read point data directly into vector (optimized binary read)
    let float_count = point_count * 3;
    let bytes_to_read = float_count * 4;
    let mut buffer = vec![0u8; bytes_to_read];
    
    if stdin.read_exact(&mut buffer).is_err() {
        std::process::exit(1);
    }
    
    // Convert bytes to floats (little-endian) - safe conversion
    let point_cloud_data: Vec<f32> = buffer
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();
    
    // Process voxel downsampling
    let downsampled_points = voxel_downsample_internal(
        &point_cloud_data,
        point_count,
        voxel_size,
        min_x,
        min_y,
        min_z,
    );
    
    // OPTIMIZATION: Write binary output instead of JSON (much faster!)
    // Binary format: [u32 outputCount][f32* downsampledPoints]
    
    let mut stdout = io::stdout();
    
    // Write output count (4 bytes)
    let output_count = downsampled_points.len() / 3;
    if stdout.write_all(&(output_count as u32).to_le_bytes()).is_err() {
        std::process::exit(1);
    }
    
    // Write downsampled points directly (binary, no serialization overhead!)
    // Convert floats to bytes in bulk for better performance
    let bytes: Vec<u8> = downsampled_points
        .iter()
        .flat_map(|&f| f.to_le_bytes().into_iter())
        .collect();
    if stdout.write_all(&bytes).is_err() || stdout.flush().is_err() {
        std::process::exit(1);
    }
}

fn voxel_downsample_internal(
    points: &[f32],
    point_count: usize,
    voxel_size: f32,
    min_x: f32,
    min_y: f32,
    min_z: f32,
) -> Vec<f32> {
    // OPTIMIZATION 1: Pre-calculate inverse voxel size to avoid division
    let inv_voxel_size = 1.0 / voxel_size;
    
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
            // Use struct for better cache locality (matches WASM implementation)
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
    
    // OPTIMIZATION 7: Pre-allocate output vector and write directly (matches WASM)
    let output_count = voxel_map.len();
    let mut downsampled_points = Vec::with_capacity(output_count * 3);
    
    // Write results directly to pre-allocated vector
    for (_voxel_key, voxel) in voxel_map {
        let count_f = voxel.count as f32;
        downsampled_points.push(voxel.sum_x / count_f);
        downsampled_points.push(voxel.sum_y / count_f);
        downsampled_points.push(voxel.sum_z / count_f);
    }
    
    downsampled_points
}
