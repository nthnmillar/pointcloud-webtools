import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';
import type { VoxelDownsampleParams, VoxelDownsampleResult } from '../ToolsService';

export class VoxelDownsamplingTS extends BaseService {
  constructor(_serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  async voxelDownsample(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    try {
      const startTime = performance.now();
      
      const pointCount = params.pointCloudData.length / 3;
      const voxelMap = new Map<string, {
        count: number;
        sumX: number;
        sumY: number;
        sumZ: number;
      }>();
      
      // OPTIMIZATION: Pre-calculate inverse voxel size (outside loop)
      const invVoxelSize = 1.0 / params.voxelSize;
      
      // OPTIMIZATION: Chunked processing for better cache locality (matching C++/Rust)
      const CHUNK_SIZE = 1024;
      for (let chunkStart = 0; chunkStart < pointCount; chunkStart += CHUNK_SIZE) {
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, pointCount);
        
        for (let i = chunkStart; i < chunkEnd; i++) {
          const i3 = i * 3;
          const x = params.pointCloudData[i3];
          const y = params.pointCloudData[i3 + 1];
          const z = params.pointCloudData[i3 + 2];
          
          // Calculate voxel coordinates - use multiplication for consistency with other implementations
          const voxelX = Math.floor((x - params.globalBounds.minX) * invVoxelSize);
          const voxelY = Math.floor((y - params.globalBounds.minY) * invVoxelSize);
          const voxelZ = Math.floor((z - params.globalBounds.minZ) * invVoxelSize);
          
          const voxelKey = `${voxelX},${voxelY},${voxelZ}`;
          
          if (voxelMap.has(voxelKey)) {
            const voxel = voxelMap.get(voxelKey)!;
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
      }
      
      // OPTIMIZATION: Pre-allocate result array (matching C++/Rust)
      const voxelCount = voxelMap.size;
      const downsampledPoints = new Float32Array(voxelCount * 3);
      let outputIndex = 0;
      for (const [_, voxel] of voxelMap) {
        downsampledPoints[outputIndex++] = voxel.sumX / voxel.count;
        downsampledPoints[outputIndex++] = voxel.sumY / voxel.count;
        downsampledPoints[outputIndex++] = voxel.sumZ / voxel.count;
      }
      
      const processingTime = performance.now() - startTime;

      return {
        success: true,
        downsampledPoints,
        originalCount: pointCount,
        downsampledCount: voxelCount,
        processingTime,
        voxelCount
      };
    } catch (error) {
      Log.Error('VoxelDownsamplingTS', 'Voxel downsampling failed', error);
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

