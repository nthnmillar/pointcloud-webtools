use std::io::{self, Read, Write};
use rustc_hash::FxHashMap;

// Binary protocol: extended same as C++ BE
// Input: [u32 pointCount][f32 voxelSize][f32 minX..maxZ][u32 flags][f32* positions][optional colors][optional intensities][optional classifications]
// flags: bit0=colors, bit1=intensity, bit2=classification
// Output: [u32 outputCount][f32* positions][optional colors][optional intensities][optional classifications]

#[derive(Clone, Copy)]
struct Voxel {
    count: i32,
    sum_x: f32,
    sum_y: f32,
    sum_z: f32,
}

#[derive(Clone)]
struct VoxelFull {
    count: i32,
    sum_x: f32,
    sum_y: f32,
    sum_z: f32,
    sum_r: f32,
    sum_g: f32,
    sum_b: f32,
    sum_intensity: f32,
    class_counts: FxHashMap<u8, i32>,
}

fn main() {
    let mut stdin = io::stdin();

    // Extended header: 36 bytes (32 + 4 for flags)
    let mut header = [0u8; 36];
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
    let flags = u32::from_le_bytes([header[32], header[33], header[34], header[35]]);

    let use_colors = (flags & 1) != 0;
    let use_intensity = (flags & 2) != 0;
    let use_classification = (flags & 4) != 0;

    if point_count == 0 || voxel_size <= 0.0 {
        let output_count: u32 = 0;
        let mut stdout = io::stdout();
        if stdout.write_all(&output_count.to_le_bytes()).is_err() || stdout.flush().is_err() {
            std::process::exit(1);
        }
        return;
    }

    let float_count = point_count * 3;
    let mut buf = vec![0u8; float_count * 4];
    if stdin.read_exact(&mut buf).is_err() {
        std::process::exit(1);
    }
    let point_cloud_data: Vec<f32> = buf
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();

    let mut input_colors: Vec<f32> = vec![];
    let mut input_intensities: Vec<f32> = vec![];
    let mut input_classifications: Vec<u8> = vec![];
    if use_colors {
        buf.resize(float_count * 4, 0);
        if stdin.read_exact(&mut buf).is_err() {
            std::process::exit(1);
        }
        input_colors = buf.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
    }
    if use_intensity {
        buf.resize(point_count * 4, 0);
        if stdin.read_exact(&mut buf).is_err() {
            std::process::exit(1);
        }
        input_intensities = buf.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
    }
    if use_classification {
        input_classifications.resize(point_count, 0);
        if stdin.read_exact(&mut input_classifications).is_err() {
            std::process::exit(1);
        }
    }

    let mut stdout = io::stdout();

    if !use_colors && !use_intensity && !use_classification {
        let downsampled_points = voxel_downsample_internal(
            &point_cloud_data,
            point_count,
            voxel_size,
            min_x,
            min_y,
            min_z,
        );
        let output_count = downsampled_points.len() / 3;
        if stdout.write_all(&(output_count as u32).to_le_bytes()).is_err() {
            std::process::exit(1);
        }
        let bytes: Vec<u8> = downsampled_points.iter().flat_map(|&f| f.to_le_bytes()).collect();
        if stdout.write_all(&bytes).is_err() || stdout.flush().is_err() {
            std::process::exit(1);
        }
        return;
    }

    let (downsampled_points, downsampled_colors, downsampled_intensities, downsampled_classifications) =
        voxel_downsample_with_attributes(
            &point_cloud_data,
            if use_colors { Some(&input_colors) } else { None },
            if use_intensity { Some(&input_intensities) } else { None },
            if use_classification { Some(&input_classifications) } else { None },
            point_count,
            voxel_size,
            min_x,
            min_y,
            min_z,
        );

    let output_count = downsampled_points.len() / 3;
    if stdout.write_all(&(output_count as u32).to_le_bytes()).is_err() {
        std::process::exit(1);
    }
    let bytes: Vec<u8> = downsampled_points.iter().flat_map(|&f| f.to_le_bytes()).collect();
    if stdout.write_all(&bytes).is_err() {
        std::process::exit(1);
    }
    if use_colors {
        let bytes: Vec<u8> = downsampled_colors.iter().flat_map(|&f| f.to_le_bytes()).collect();
        let _ = stdout.write_all(&bytes);
    }
    if use_intensity {
        let bytes: Vec<u8> = downsampled_intensities.iter().flat_map(|&f| f.to_le_bytes()).collect();
        let _ = stdout.write_all(&bytes);
    }
    if use_classification {
        let _ = stdout.write_all(&downsampled_classifications);
    }
    let _ = stdout.flush();
}

fn voxel_downsample_with_attributes(
    points: &[f32],
    colors: Option<&Vec<f32>>,
    intensities: Option<&Vec<f32>>,
    classifications: Option<&Vec<u8>>,
    point_count: usize,
    voxel_size: f32,
    min_x: f32,
    min_y: f32,
    min_z: f32,
) -> (Vec<f32>, Vec<f32>, Vec<f32>, Vec<u8>) {
    let inv_voxel_size = 1.0 / voxel_size;
    let use_colors = colors.map(|c| c.len() == point_count * 3).unwrap_or(false);
    let use_intensity = intensities.map(|i| i.len() == point_count).unwrap_or(false);
    let use_classification = classifications.map(|c| c.len() == point_count).unwrap_or(false);

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
            let voxel_key = ((voxel_x as u64) << 32) | ((voxel_y as u64) << 16) | (voxel_z as u64);

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
                        sum_r,
                        sum_g,
                        sum_b,
                        sum_intensity,
                        class_counts,
                    }
                });
        }
    }

    let output_count = voxel_map.len();
    let mut downsampled_points = vec![0.0f32; output_count * 3];
    let mut downsampled_colors = vec![0.0f32; if use_colors { output_count * 3 } else { 0 }];
    let mut downsampled_intensities = vec![0.0f32; if use_intensity { output_count } else { 0 }];
    let mut downsampled_classifications = vec![0u8; if use_classification { output_count } else { 0 }];

    let mut output_index = 0;
    for (_k, voxel) in voxel_map {
        let count_f = voxel.count as f32;
        downsampled_points[output_index * 3] = voxel.sum_x / count_f;
        downsampled_points[output_index * 3 + 1] = voxel.sum_y / count_f;
        downsampled_points[output_index * 3 + 2] = voxel.sum_z / count_f;
        if use_colors {
            downsampled_colors[output_index * 3] = voxel.sum_r / count_f;
            downsampled_colors[output_index * 3 + 1] = voxel.sum_g / count_f;
            downsampled_colors[output_index * 3 + 2] = voxel.sum_b / count_f;
        }
        if use_intensity {
            downsampled_intensities[output_index] = voxel.sum_intensity / count_f;
        }
        if use_classification {
            downsampled_classifications[output_index] = voxel
                .class_counts
                .iter()
                .max_by_key(|(_, &c)| c)
                .map(|(&k, _)| k)
                .unwrap_or(0);
        }
        output_index += 1;
    }

    (downsampled_points, downsampled_colors, downsampled_intensities, downsampled_classifications)
}

pub(crate) fn voxel_downsample_internal(
    points: &[f32],
    point_count: usize,
    voxel_size: f32,
    min_x: f32,
    min_y: f32,
    min_z: f32,
) -> Vec<f32> {
    // OPTIMIZATION 1: Pre-calculate inverse voxel size to avoid division
    let inv_voxel_size = 1.0 / voxel_size;
    
    // Use FxHashMap for fast integer key hashing with struct for better cache locality
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
    
    // Pre-allocate output vector and write directly using indexing for efficiency
    // Use direct indexing instead of push() for better performance (like C++ does)
    let output_count = voxel_map.len();
    let mut downsampled_points = vec![0.0f32; output_count * 3];
    
    // Write results directly to pre-allocated vector using indexing (faster than push)
    let mut output_index = 0;
    for (_voxel_key, voxel) in voxel_map {
        let count_f = voxel.count as f32;
        downsampled_points[output_index * 3] = voxel.sum_x / count_f;
        downsampled_points[output_index * 3 + 1] = voxel.sum_y / count_f;
        downsampled_points[output_index * 3 + 2] = voxel.sum_z / count_f;
        output_index += 1;
    }
    
    downsampled_points
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_voxel_downsample_simple() {
        // Simple test: 4 points forming a square, should downsample to 1 point
        let points = vec![
            0.0, 0.0, 0.0,  // Point 1
            1.0, 0.0, 0.0,  // Point 2
            0.0, 1.0, 0.0,  // Point 3
            1.0, 1.0, 0.0,  // Point 4
        ];
        let point_count = 4;
        let voxel_size = 2.0; // Large enough to contain all points
        let min_x = 0.0;
        let min_y = 0.0;
        let min_z = 0.0;

        let result = voxel_downsample_internal(&points, point_count, voxel_size, min_x, min_y, min_z);

        // Should produce 1 voxel (all points in same voxel)
        assert_eq!(result.len(), 3);
        // Average should be (0.5, 0.5, 0.0)
        assert!((result[0] - 0.5).abs() < 0.001);
        assert!((result[1] - 0.5).abs() < 0.001);
        assert!((result[2] - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_voxel_downsample_empty() {
        let points = vec![];
        let result = voxel_downsample_internal(&points, 0, 1.0, 0.0, 0.0, 0.0);
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_voxel_downsample_single_point() {
        let points = vec![1.0, 2.0, 3.0];
        let result = voxel_downsample_internal(&points, 1, 1.0, 0.0, 0.0, 0.0);
        assert_eq!(result.len(), 3);
        assert!((result[0] - 1.0).abs() < 0.001);
        assert!((result[1] - 2.0).abs() < 0.001);
        assert!((result[2] - 3.0).abs() < 0.001);
    }

    #[test]
    fn test_voxel_downsample_separate_voxels() {
        // Two points in separate voxels
        let points = vec![
            0.0, 0.0, 0.0,  // Voxel (0,0,0)
            2.0, 0.0, 0.0,  // Voxel (2,0,0) - different voxel
        ];
        let result = voxel_downsample_internal(&points, 2, 1.0, 0.0, 0.0, 0.0);
        // Should produce 2 voxels
        assert_eq!(result.len(), 6);
    }
}
