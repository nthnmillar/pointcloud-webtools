use std::io::{self, Read, Write};
use rustc_hash::FxHashSet;

// Binary protocol for fast I/O
// Input format: [u32 pointCount][f32 voxelSize][f32 minX][f32 minY][f32 minZ][f32 maxX][f32 maxY][f32 maxZ][f32* pointData]
// Output format: [u32 voxelCount][f32* voxelGridPositions]

fn main() {
    // Read binary input for fast I/O
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
        // Write empty result (4 bytes: voxelCount = 0)
        let voxel_count: u32 = 0;
        let mut stdout = io::stdout();
        if stdout.write_all(&voxel_count.to_le_bytes()).is_err() || stdout.flush().is_err() {
            std::process::exit(1);
        }
        return;
    }
    
    // Safety check: prevent unreasonable allocations (max 100M points = ~1.2GB)
    const MAX_POINTS: usize = 100_000_000;
    if point_count > MAX_POINTS {
        eprintln!("Error: point_count {} exceeds maximum {}", point_count, MAX_POINTS);
        std::process::exit(1);
    }
    
    // Read point data directly into vector (optimized binary read)
    let float_count = point_count * 3;
    let bytes_to_read = float_count * 4;
    
    // Additional safety check for bytes_to_read
    if bytes_to_read > 2_000_000_000 { // 2GB max
        eprintln!("Error: bytes_to_read {} exceeds maximum 2GB", bytes_to_read);
        std::process::exit(1);
    }
    
    let mut buffer = vec![0u8; bytes_to_read];
    
    if stdin.read_exact(&mut buffer).is_err() {
        std::process::exit(1);
    }
    
    // Convert bytes to floats (little-endian) - safe conversion
    let point_cloud_data: Vec<f32> = buffer
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();
    
    // Process voxel debug generation
    let voxel_grid_positions = generate_voxel_centers(
        &point_cloud_data,
        point_count,
        voxel_size,
        min_x,
        min_y,
        min_z,
    );
    
    // Write binary output for fast I/O
    // Binary format: [u32 voxelCount][f32* voxelGridPositions]
    
    let mut stdout = io::stdout();
    
    // Write voxel count (4 bytes)
    let voxel_count = voxel_grid_positions.len() / 3;
    if stdout.write_all(&(voxel_count as u32).to_le_bytes()).is_err() {
        std::process::exit(1);
    }
    
    // Write voxel grid positions directly (binary, no serialization overhead!)
    // Convert floats to bytes in bulk for better performance
    let bytes: Vec<u8> = voxel_grid_positions
        .iter()
        .flat_map(|&f| f.to_le_bytes().into_iter())
        .collect();
    if stdout.write_all(&bytes).is_err() || stdout.flush().is_err() {
        std::process::exit(1);
    }
}

fn generate_voxel_centers(
    points: &[f32],
    point_count: usize,
    voxel_size: f32,
    min_x: f32,
    min_y: f32,
    min_z: f32,
) -> Vec<f32> {
    // Pre-calculate constants at the start for efficiency
    let inv_voxel_size = 1.0 / voxel_size;
    let half_voxel_size = voxel_size * 0.5;
    let offset_x = min_x + half_voxel_size;
    let offset_y = min_y + half_voxel_size;
    let offset_z = min_z + half_voxel_size;
    
    // Use FxHashSet with integer keys for fast hashing
    // Integer keys are faster to hash than tuples (same optimization as downsampling)
    // Pre-allocate with estimated capacity to avoid reallocations (same as downsampling)
    let estimated_voxels = (point_count / 100).min(100_000);
    let mut voxel_keys: FxHashSet<u64> = FxHashSet::with_capacity_and_hasher(estimated_voxels, Default::default());
    
    // Process points in chunks for better cache locality
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
            
            // Use integer hash key for fast lookup
            let voxel_key = ((voxel_x as u64) << 32) | ((voxel_y as u64) << 16) | (voxel_z as u64);
            
            voxel_keys.insert(voxel_key);
        }
    }
    
    // OPTIMIZATION 6: Pre-allocate result vector with exact capacity
    let voxel_count = voxel_keys.len();
    let mut voxel_grid_positions = Vec::with_capacity(voxel_count * 3);
    
    // OPTIMIZATION 7: Single pass conversion with direct grid position calculation
    for voxel_key in voxel_keys {
        // Extract voxel coordinates from integer key (same as C++/WASM)
        let voxel_x = (voxel_key >> 32) as i32;
        let voxel_y = ((voxel_key >> 16) & 0xFFFF) as i16 as i32; // Sign-extend 16-bit
        let voxel_z = (voxel_key & 0xFFFF) as i16 as i32; // Sign-extend 16-bit
        
        // Calculate voxel grid position (center of voxel grid cell)
        let center_x = offset_x + voxel_x as f32 * voxel_size;
        let center_y = offset_y + voxel_y as f32 * voxel_size;
        let center_z = offset_z + voxel_z as f32 * voxel_size;
        
        voxel_grid_positions.push(center_x);
        voxel_grid_positions.push(center_y);
        voxel_grid_positions.push(center_z);
    }
    
    voxel_grid_positions
}
