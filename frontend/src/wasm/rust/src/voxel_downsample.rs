use crate::common::Voxel;
use rustc_hash::FxHashMap;

pub fn voxel_downsample_internal(
    points: &[f32],
    voxel_size: f32,
    min_x: f32,
    min_y: f32,
    min_z: f32,
    output_ptr: *mut f32,
) -> usize {
    // Pre-calculate inverse voxel size to avoid division operations
    let inv_voxel_size = 1.0 / voxel_size;
    
    let point_count = points.len() / 3;
    
    // Validate slice length
    if points.len() < point_count * 3 {
        return 0;
    }
    
    // Use fast hash map with integer keys for voxel lookup
    // Pre-allocate with estimated capacity to minimize reallocations
    let estimated_voxels = (point_count / 100).min(100_000);
    let mut voxel_map: FxHashMap<u64, Voxel> = FxHashMap::with_capacity_and_hasher(estimated_voxels, Default::default());
    
    // Process points in chunks for better CPU cache performance
    const CHUNK_SIZE: usize = 1024;
    
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
            
            // Update or insert voxel data using single hash lookup
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
    
    // Write averaged voxel centers directly to output buffer
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

