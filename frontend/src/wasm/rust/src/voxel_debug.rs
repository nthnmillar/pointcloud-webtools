use rustc_hash::FxHashSet;

pub fn generate_voxel_centers_internal(
    points: &[f32],
    voxel_size: f32,
    min_x: f32,
    min_y: f32,
    min_z: f32,
) -> Vec<f32> {
    // Pre-calculate constants to avoid repeated calculations
    let inv_voxel_size = 1.0 / voxel_size;
    let half_voxel_size = voxel_size * 0.5;
    let offset_x = min_x + half_voxel_size;
    let offset_y = min_y + half_voxel_size;
    let offset_z = min_z + half_voxel_size;
    
    // Use fast hash set with integer keys to track unique voxels
    let mut voxel_keys: FxHashSet<u64> = FxHashSet::default();
    
    // Process points in chunks for better CPU cache performance
    const CHUNK_SIZE: usize = 1024;
    let point_count = points.len() / 3;
    
    for chunk_start in (0..point_count).step_by(CHUNK_SIZE) {
        let chunk_end = (chunk_start + CHUNK_SIZE).min(point_count);
        
        for i in chunk_start..chunk_end {
            let i3 = i * 3;
            let x = points[i3];
            let y = points[i3 + 1];
            let z = points[i3 + 2];
            
            // Calculate voxel grid coordinates using multiplication (faster than division)
            let voxel_x = ((x - min_x) * inv_voxel_size).floor() as i32;
            let voxel_y = ((y - min_y) * inv_voxel_size).floor() as i32;
            let voxel_z = ((z - min_z) * inv_voxel_size).floor() as i32;
            
            // Combine coordinates into single integer hash key
            let voxel_key = ((voxel_x as u64) << 32) | ((voxel_y as u64) << 16) | (voxel_z as u64);
            
            voxel_keys.insert(voxel_key);
        }
    }
    
    // Pre-allocate result vector with exact capacity
    let voxel_count = voxel_keys.len();
    let mut centers = Vec::with_capacity(voxel_count * 3);
    
    // Convert unique voxel keys to center positions
    for voxel_key in voxel_keys {
        // Extract voxel coordinates from integer key
        let voxel_x = (voxel_key >> 32) as i32;
        let voxel_y = ((voxel_key >> 16) & 0xFFFF) as i16 as i32;
        let voxel_z = (voxel_key & 0xFFFF) as i16 as i32;
        
        // Calculate voxel center position
        let center_x = offset_x + voxel_x as f32 * voxel_size;
        let center_y = offset_y + voxel_y as f32 * voxel_size;
        let center_z = offset_z + voxel_z as f32 * voxel_size;
        
        centers.push(center_x);
        centers.push(center_y);
        centers.push(center_z);
    }
    
    centers
}

