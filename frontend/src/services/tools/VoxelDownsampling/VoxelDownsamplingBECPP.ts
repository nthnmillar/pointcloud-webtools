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

export class VoxelDownsamplingBECPP extends BaseService {
  constructor(serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  async voxelDownsample(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    try {
      const startTime = performance.now();
      
      // Make HTTP request to actual C++ backend for real benchmarking
      const response = await fetch('http://localhost:3003/api/voxel-downsample', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          points: Array.from(params.pointCloudData),
          voxelSize: params.voxelSize,
          globalBounds: params.globalBounds
        })
      });

      if (!response.ok) {
        throw new Error(`Backend request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const processingTime = performance.now() - startTime;
      
      Log.Info('VoxelDownsamplingBECPP', 'Voxel downsampling completed using real C++ backend', {
        originalCount: result.originalCount,
        downsampledCount: result.downsampledCount,
        voxelCount: result.voxelCount,
        processingTime: `${processingTime.toFixed(2)}ms`
      });
      
      return {
        success: true,
        downsampledPoints: new Float32Array(result.downsampledPoints),
        originalCount: result.originalCount,
        downsampledCount: result.downsampledCount,
        processingTime: processingTime,
        voxelCount: result.voxelCount
      };
    } catch (error) {
      Log.Error('VoxelDownsamplingBECPP', 'Real C++ backend voxel downsampling failed', error);
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

