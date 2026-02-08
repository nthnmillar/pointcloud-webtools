use crate::common::{Voxel, VoxelFull};
use rustc_hash::FxHashMap;

/// Voxel downsampling with optional colors (average per voxel), intensity (average), classification (mode).
/// Pass None for any attribute to skip it. Output pointers can be null (0) to skip writing that attribute.
pub fn voxel_downsample_with_attributes_internal(
    points: &[f32],
    colors: Option<&[f32]>,
    intensities: Option<&[f32]>,
    classifications: Option<&[u8]>,
    voxel_size: f32,
    min_x: f32,
    min_y: f32,
    min_z: f32,
    output_ptr: *mut f32,
    output_colors: Option<*mut f32>,
    output_intensities: Option<*mut f32>,
    output_classifications: Option<*mut u8>,
) -> usize {
    let inv_voxel_size = 1.0 / voxel_size;
    let point_count = points.len() / 3;
    if points.len() < point_count * 3 {
        return 0;
    }
    let use_colors = output_colors.is_some()
        && colors.map(|c| c.len() == point_count * 3).unwrap_or(false);
    let use_intensity = output_intensities.is_some()
        && intensities.map(|i| i.len() == point_count).unwrap_or(false);
    let use_classification = output_classifications.is_some()
        && classifications.map(|c| c.len() == point_count).unwrap_or(false);

    let estimated_voxels = (point_count / 100).max(100).min(100_000);
    let mut voxel_map: FxHashMap<u64, VoxelFull> =
        FxHashMap::with_capacity_and_hasher(estimated_voxels, Default::default());

    const CHUNK_SIZE: usize = 1024;
    for chunk_start in (0..point_count).step_by(CHUNK_SIZE) {
        let chunk_end = (chunk_start + CHUNK_SIZE).min(point_count);
        for i in chunk_start..chunk_end {
            let i3 = i * 3;
            let x = points[i3];
            let y = points[i3 + 1];
            let z = points[i3 + 2];
            let voxel_x = ((x - min_x) * inv_voxel_size).floor() as i32;
            let voxel_y = ((y - min_y) * inv_voxel_size).floor() as i32;
            let voxel_z = ((z - min_z) * inv_voxel_size).floor() as i32;
            let voxel_key =
                ((voxel_x as u64) << 32) | ((voxel_y as u64) << 16) | (voxel_z as u64);

            let (sum_r, sum_g, sum_b) = if use_colors {
                let c = colors.unwrap();
                (c[i3], c[i3 + 1], c[i3 + 2])
            } else {
                (0.0f32, 0.0f32, 0.0f32)
            };
            let sum_intensity = if use_intensity {
                intensities.unwrap()[i]
            } else {
                0.0f32
            };
            let class_byte = if use_classification {
                classifications.unwrap()[i]
            } else {
                0u8
            };

            voxel_map
                .entry(voxel_key)
                .and_modify(|v| {
                    v.count += 1;
                    v.sum_x += x;
                    v.sum_y += y;
                    v.sum_z += z;
                    if use_colors {
                        v.sum_r += sum_r;
                        v.sum_g += sum_g;
                        v.sum_b += sum_b;
                    }
                    if use_intensity {
                        v.sum_intensity += sum_intensity;
                    }
                    if use_classification {
                        *v.class_counts.entry(class_byte).or_insert(0) += 1;
                    }
                })
                .or_insert_with(|| {
                    let mut class_counts = FxHashMap::default();
                    if use_classification {
                        class_counts.insert(class_byte, 1);
                    }
                    VoxelFull {
                        count: 1,
                        sum_x: x,
                        sum_y: y,
                        sum_z: z,
                        sum_r: sum_r,
                        sum_g: sum_g,
                        sum_b: sum_b,
                        sum_intensity: sum_intensity,
                        class_counts,
                    }
                });
        }
    }

    let mut output_index = 0;
    for (_k, voxel) in voxel_map {
        let count_f = voxel.count as f32;
        unsafe {
            let base = output_index * 3;
            *output_ptr.add(base) = voxel.sum_x / count_f;
            *output_ptr.add(base + 1) = voxel.sum_y / count_f;
            *output_ptr.add(base + 2) = voxel.sum_z / count_f;
        }
        if let Some(out_colors) = output_colors {
            unsafe {
                let base = output_index * 3;
                *out_colors.add(base) = voxel.sum_r / count_f;
                *out_colors.add(base + 1) = voxel.sum_g / count_f;
                *out_colors.add(base + 2) = voxel.sum_b / count_f;
            }
        }
        if let Some(out_int) = output_intensities {
            unsafe {
                *out_int.add(output_index) = voxel.sum_intensity / count_f;
            }
        }
        if let Some(out_cls) = output_classifications {
            let mode = voxel
                .class_counts
                .iter()
                .max_by_key(|(_, &c)| c)
                .map(|(&cls, _)| cls)
                .unwrap_or(0);
            unsafe {
                *out_cls.add(output_index) = mode;
            }
        }
        output_index += 1;
    }
    output_index
}

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

