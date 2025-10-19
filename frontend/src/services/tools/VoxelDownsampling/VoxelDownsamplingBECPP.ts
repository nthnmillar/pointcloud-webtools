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

  private async retryBackendRequest<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = 5,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error as Error;
        
        // Check if this is a network error (backend not ready)
        const isNetworkError = error instanceof TypeError && 
          (error.message.includes('fetch') || error.message.includes('CORS'));
        
        if (isNetworkError && attempt < maxRetries) {
          Log.Info('VoxelDownsamplingBECPP', `Backend not ready, retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        // If it's not a network error or we've exhausted retries, throw
        throw error;
      }
    }
    
    throw lastError;
  }

  async voxelDownsample(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    try {
      const startTime = performance.now();
      
      const pointCount = params.pointCloudData.length / 3;
      
      Log.Info('VoxelDownsamplingBECPP', 'Starting backend voxel downsampling with single request', {
        pointCount,
        voxelSize: params.voxelSize,
        bounds: params.globalBounds
      });

      // Use single request - no batching
      const result = await this.retryBackendRequest(async () => {
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

        return await response.json();
      });

      const processingTime = performance.now() - startTime;
      
      Log.Info('VoxelDownsamplingBECPP', 'Backend voxel downsampling completed with single request', {
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
      Log.Error('VoxelDownsamplingBECPP', 'Backend voxel downsampling failed after retries', error);
      
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

