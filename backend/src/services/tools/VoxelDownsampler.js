/**
 * Voxel Downsampling Service
 * Handles voxel-based downsampling of point cloud data
 */

class VoxelDownsampler {
  constructor() {
    this.name = 'VoxelDownsampler';
  }

  /**
   * Perform voxel downsampling on point cloud data
   * @param {Array<number>} points - Flat array of x,y,z coordinates
   * @param {number} voxelSize - Size of each voxel
   * @param {Object} globalBounds - Bounding box of the point cloud
   * @returns {Object} Downsampling result
   */
  performVoxelDownsampling(points, voxelSize, globalBounds) {
    // Calculate bounds if not provided
    let bounds = globalBounds;
    if (!bounds) {
      bounds = this.calculateBounds(points);
    }
    
    // Create a map to store voxel centers
    const voxelMap = new Map();
    
    // Process each point
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i];
      const y = points[i + 1];
      const z = points[i + 2];
      
      // Calculate voxel coordinates
      const voxelX = Math.floor((x - bounds.minX) / voxelSize);
      const voxelY = Math.floor((y - bounds.minY) / voxelSize);
      const voxelZ = Math.floor((z - bounds.minZ) / voxelSize);
      
      // Create voxel key
      const voxelKey = `${voxelX},${voxelY},${voxelZ}`;
      
      // Add point to voxel
      if (voxelMap.has(voxelKey)) {
        const voxel = voxelMap.get(voxelKey);
        voxel.count++;
        voxel.sumX += x;
        voxel.sumY += y;
        voxel.sumZ += z;
      } else {
        voxelMap.set(voxelKey, {
          count: 1,
          sumX: x,
          sumY: y,
          sumZ: z
        });
      }
    }
    
    // Convert voxel centers back to points
    const downsampledPoints = [];
    
    for (const [_, voxel] of voxelMap) {
      // Calculate average position (voxel center)
      const avgX = voxel.sumX / voxel.count;
      const avgY = voxel.sumY / voxel.count;
      const avgZ = voxel.sumZ / voxel.count;
      
      downsampledPoints.push(avgX, avgY, avgZ);
    }
    
    return {
      downsampledPoints,
      originalCount: points.length / 3,
      downsampledCount: downsampledPoints.length / 3,
      voxelCount: voxelMap.size,
      reductionRatio: (points.length / 3) / (downsampledPoints.length / 3)
    };
  }

  /**
   * Calculate bounding box from point cloud data
   * @param {Array<number>} points - Flat array of x,y,z coordinates
   * @returns {Object} Bounding box with min/max coordinates
   */
  calculateBounds(points) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i];
      const y = points[i + 1];
      const z = points[i + 2];
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
    
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }

  /**
   * Validate input parameters
   * @param {Array<number>} points - Point cloud data
   * @param {number} voxelSize - Voxel size
   * @param {Object} globalBounds - Global bounds
   * @throws {Error} If validation fails
   */
  validateInputs(points, voxelSize, globalBounds) {
    if (!points || !Array.isArray(points)) {
      throw new Error('Invalid points data. Expected array of numbers.');
    }
    
    if (points.length % 3 !== 0) {
      throw new Error('Points array length must be divisible by 3 (x,y,z coordinates).');
    }
    
    if (typeof voxelSize !== 'number' || voxelSize <= 0) {
      throw new Error('Invalid voxel size. Expected positive number.');
    }
    
    if (globalBounds) {
      const requiredProps = ['minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'];
      for (const prop of requiredProps) {
        if (typeof globalBounds[prop] !== 'number' || !isFinite(globalBounds[prop])) {
          throw new Error(`Invalid global bounds. ${prop} must be a finite number.`);
        }
      }
    }
  }
}

export default VoxelDownsampler;
