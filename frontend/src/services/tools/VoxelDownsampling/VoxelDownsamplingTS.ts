import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';

export interface VoxelDownsampleParams {
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

export interface VoxelDownsampleResult {
  success: boolean;
  downsampledPoints?: Float32Array;
  originalCount?: number;
  downsampledCount?: number;
  processingTime?: number;
  voxelCount?: number;
  error?: string;
}

export class VoxelDownsamplingTS extends BaseService {
  constructor(serviceManager: ServiceManager) {
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
      
      // Process each point
      for (let i = 0; i < pointCount; i++) {
        const x = params.pointCloudData[i * 3];
        const y = params.pointCloudData[i * 3 + 1];
        const z = params.pointCloudData[i * 3 + 2];
        
        // Calculate voxel coordinates - use multiplication for consistency with other implementations
        const invVoxelSize = 1.0 / params.voxelSize;
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
      
      // Create downsampled points
      const downsampledPoints: number[] = [];
      for (const [_, voxel] of voxelMap) {
        downsampledPoints.push(
          voxel.sumX / voxel.count,
          voxel.sumY / voxel.count,
          voxel.sumZ / voxel.count
        );
      }
      
      const processingTime = performance.now() - startTime;

      return {
        success: true,
        downsampledPoints: new Float32Array(downsampledPoints),
        originalCount: pointCount,
        downsampledCount: downsampledPoints.length / 3,
        processingTime,
        voxelCount: voxelMap.size
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

