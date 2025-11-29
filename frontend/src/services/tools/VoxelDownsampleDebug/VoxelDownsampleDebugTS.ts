import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';

export interface VoxelDebugParams {
  pointCloudData: Float32Array;
  voxelSize: number;
  globalBounds: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  };
}

export interface VoxelDebugResult {
  success: boolean;
  voxelCenters?: Float32Array;
  voxelCount?: number;
  processingTime?: number;
  error?: string;
}

export class VoxelDownsampleDebugTS extends BaseService {
  constructor(_serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  async generateVoxelCenters(params: VoxelDebugParams): Promise<VoxelDebugResult> {
    const pointCount = params.pointCloudData.length / 3;
    Log.Info('VoxelDownsampleDebugTS', 'Generating voxel centers', {
      pointCount,
      voxelSize: params.voxelSize,
      bounds: params.globalBounds
    });
    
    try {
      const startTime = performance.now();
      
      // OPTIMIZATION 1: Use Set for unique voxel coordinates
      // Note: JavaScript bitwise ops are 32-bit only, so string keys are necessary
      // But we optimize the extraction to avoid repeated parsing overhead
      const voxelCoords = new Set<string>();
      
      // OPTIMIZATION 2: Pre-calculate inverse voxel size to avoid division
      // Use Math.fround to ensure 32-bit float precision to match C++ float operations
      // This is critical - C++ uses float (32-bit) while JS uses number (64-bit double)
      // By using Math.fround, we ensure the multiplication matches C++ float precision
      const invVoxelSize = Math.fround(1.0 / params.voxelSize);
      const minX = Math.fround(params.globalBounds.minX);
      const minY = Math.fround(params.globalBounds.minY);
      const minZ = Math.fround(params.globalBounds.minZ);
      
      // Debug: Track all voxel coordinates to compare with other implementations
      const debugVoxels: string[] = [];
      const allVoxelKeys: string[] = [];
      
      // OPTIMIZATION 3: Process points in chunks for better performance
      const CHUNK_SIZE = 1024;
      for (let chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, pointCount);
        
        for (let i = chunkStart; i < chunkEnd; i++) {
          const i3 = i * 3;
          // Float32Array already stores values as 32-bit floats, so no need to fround here
          const x = params.pointCloudData[i3];
          const y = params.pointCloudData[i3 + 1];
          const z = params.pointCloudData[i3 + 2];
          
          // OPTIMIZATION 4: Use multiplication instead of division
          // Use Math.floor to match Rust's .floor() and C++'s std::floor()
          // Calculate exactly the same way as C++/Rust implementations
          // C++ code: int voxelX = static_cast<int>(std::floor((x - minX) * invVoxelSize));
          // Use Math.fround on intermediate calculation to match C++ float precision
          // This ensures (x - minX) * invVoxelSize matches C++ float arithmetic exactly
          const deltaX = Math.fround((x - minX) * invVoxelSize);
          const deltaY = Math.fround((y - minY) * invVoxelSize);
          const deltaZ = Math.fround((z - minZ) * invVoxelSize);
          
          // Apply floor - this should now match C++ exactly
          const voxelX = Math.floor(deltaX);
          const voxelY = Math.floor(deltaY);
          const voxelZ = Math.floor(deltaZ);
          
          // OPTIMIZATION 5: Store unique voxel coordinates as composite key
          // JavaScript bitwise ops are 32-bit, so use string key BUT optimized format
          // Format: "x,y,z" for Set uniqueness, but we'll parse efficiently later
          // Using template string is still faster than split+map in extraction loop
          const voxelKey = `${voxelX},${voxelY},${voxelZ}`;
          
          // Debug: Track all voxel keys for comparison
          allVoxelKeys.push(voxelKey);
          
          // Debug: Track first few unique voxels
          if (debugVoxels.length < 10 && !voxelCoords.has(voxelKey)) {
            debugVoxels.push(voxelKey);
          }
          
          voxelCoords.add(voxelKey);
        }
      }
      
      // Debug: Log all unique voxels sorted to compare with other implementations
      const sortedVoxels = Array.from(voxelCoords).sort();
      
      // Output to console for easy comparison
      console.log('🔍 TS Voxel Keys (sorted):', sortedVoxels);
      console.log('🔍 TS Voxel Count:', sortedVoxels.length);
      
      Log.Info('VoxelDownsampleDebugTS', 'Voxel processing complete', {
        totalPoints: pointCount,
        uniqueVoxels: voxelCoords.size,
        firstFewVoxels: debugVoxels.slice(0, 5),
        allUniqueVoxels: sortedVoxels,
        bounds: { minX, minY, minZ },
        invVoxelSize,
        sampleCalculations: pointCount > 0 ? {
          firstPoint: {
            x: params.pointCloudData[0],
            y: params.pointCloudData[1],
            z: params.pointCloudData[2],
            deltaX: (params.pointCloudData[0] - minX) * invVoxelSize,
            deltaY: (params.pointCloudData[1] - minY) * invVoxelSize,
            deltaZ: (params.pointCloudData[2] - minZ) * invVoxelSize,
            voxelX: Math.floor((params.pointCloudData[0] - minX) * invVoxelSize),
            voxelY: Math.floor((params.pointCloudData[1] - minY) * invVoxelSize),
            voxelZ: Math.floor((params.pointCloudData[2] - minZ) * invVoxelSize)
          }
        } : null
      });
      
      // OPTIMIZATION 6: Pre-allocate result array and calculate grid positions directly
      const voxelCount = voxelCoords.size;
      const voxelGridPositions = new Float32Array(voxelCount * 3);
      
      // OPTIMIZATION 7: Pre-calculate offsets for grid position calculation
      const halfVoxelSize = params.voxelSize * 0.5;
      const offsetX = minX + halfVoxelSize;
      const offsetY = minY + halfVoxelSize;
      const offsetZ = minZ + halfVoxelSize;
      
      let index = 0;
      // OPTIMIZATION 8: Pre-compile regex for faster parsing (reuse across iterations)
      const parseRegex = /^(-?\d+),(-?\d+),(-?\d+)$/;
      for (const voxelKey of voxelCoords) {
        // Extract voxel coordinates using regex (faster than split+map for 3 values)
        const match = voxelKey.match(parseRegex);
        if (!match) continue;  // Safety check
        const voxelX = parseInt(match[1], 10);
        const voxelY = parseInt(match[2], 10);
        const voxelZ = parseInt(match[3], 10);
        
        // OPTIMIZATION 9: Direct grid position calculation (same as C++/Rust)
        const gridX = offsetX + voxelX * params.voxelSize;
        const gridY = offsetY + voxelY * params.voxelSize;
        const gridZ = offsetZ + voxelZ * params.voxelSize;
        
        voxelGridPositions[index++] = gridX;
        voxelGridPositions[index++] = gridY;
        voxelGridPositions[index++] = gridZ;
      }
      
      const processingTime = performance.now() - startTime;
      
      Log.Info('VoxelDownsampleDebugTS', 'Voxel centers generated', {
        voxelCount: voxelCoords.size,
        processingTime: processingTime.toFixed(2) + 'ms'
      });

      return {
        success: true,
        voxelCenters: voxelGridPositions,
        voxelCount: voxelCoords.size,
        processingTime
      };
    } catch (error) {
      Log.Error('VoxelDownsampleDebugTS', 'Voxel centers generation failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  dispose(): void {
    // Cleanup implementation if needed
  }
}
