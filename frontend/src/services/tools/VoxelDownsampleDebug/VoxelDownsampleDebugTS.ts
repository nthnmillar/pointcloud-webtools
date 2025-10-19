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
    Log.Info('VoxelDownsampleDebugTS', 'Generating voxel centers', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize,
      bounds: params.globalBounds
    });
    
    try {
      const startTime = performance.now();
      
      const pointCount = params.pointCloudData.length / 3;
      
      // OPTIMIZATION 1: Use Map with integer keys instead of string keys
      const voxelMap = new Map<number, {
        voxelX: number;
        voxelY: number;
        voxelZ: number;
        count: number;
        sumX: number;
        sumY: number;
        sumZ: number;
      }>();
      
      // OPTIMIZATION 2: Pre-calculate inverse voxel size to avoid division
      const invVoxelSize = 1.0 / params.voxelSize;
      const minX = params.globalBounds.minX;
      const minY = params.globalBounds.minY;
      const minZ = params.globalBounds.minZ;
      
      // OPTIMIZATION 3: Process points in chunks for better performance
      const CHUNK_SIZE = 1024;
      for (let chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, pointCount);
        
        for (let i = chunkStart; i < chunkEnd; i++) {
          const i3 = i * 3;
          const x = params.pointCloudData[i3];
          const y = params.pointCloudData[i3 + 1];
          const z = params.pointCloudData[i3 + 2];
          
          // OPTIMIZATION 4: Use multiplication instead of division
          const voxelX = Math.floor((x - minX) * invVoxelSize);
          const voxelY = Math.floor((y - minY) * invVoxelSize);
          const voxelZ = Math.floor((z - minZ) * invVoxelSize);
          
          // OPTIMIZATION 5: Use integer hash key instead of string concatenation
          const voxelKey = (voxelX << 32) | (voxelY << 16) | voxelZ;
          
          if (voxelMap.has(voxelKey)) {
            const voxel = voxelMap.get(voxelKey)!;
            voxel.count++;
            voxel.sumX += x;
            voxel.sumY += y;
            voxel.sumZ += z;
          } else {
            voxelMap.set(voxelKey, {
              voxelX,
              voxelY,
              voxelZ,
              count: 1,
              sumX: x,
              sumY: y,
              sumZ: z
            });
          }
        }
      }
      
      // OPTIMIZATION 6: Pre-allocate result array and calculate grid positions directly
      const voxelCount = voxelMap.size;
      const voxelGridPositions = new Float32Array(voxelCount * 3);
      
      // OPTIMIZATION 7: Pre-calculate offsets for grid position calculation
      const halfVoxelSize = params.voxelSize * 0.5;
      const offsetX = minX + halfVoxelSize;
      const offsetY = minY + halfVoxelSize;
      const offsetZ = minZ + halfVoxelSize;
      
      let index = 0;
      for (const [voxelKey, voxel] of voxelMap) {
        // OPTIMIZATION 8: Direct grid position calculation (same as C++/Rust)
        const gridX = offsetX + voxel.voxelX * params.voxelSize;
        const gridY = offsetY + voxel.voxelY * params.voxelSize;
        const gridZ = offsetZ + voxel.voxelZ * params.voxelSize;
        
        voxelGridPositions[index++] = gridX;
        voxelGridPositions[index++] = gridY;
        voxelGridPositions[index++] = gridZ;
      }
      
      const processingTime = performance.now() - startTime;
      
      Log.Info('VoxelDownsampleDebugTS', 'Voxel centers generated', {
        voxelCount: voxelMap.size,
        processingTime: processingTime.toFixed(2) + 'ms'
      });

      return {
        success: true,
        voxelCenters: voxelGridPositions,
        voxelCount: voxelMap.size,
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
