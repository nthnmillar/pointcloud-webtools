import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';

export interface PointCloudSmoothingParams {
  points: Float32Array;
  smoothingRadius: number;
  iterations: number;
}

export interface PointCloudSmoothingResult {
  success: boolean;
  smoothedPoints?: Float32Array;
  originalCount?: number;
  smoothedCount?: number;
  processingTime?: number;
  error?: string;
}

export class PointCloudSmoothingBECPP extends BaseService {
  constructor(_serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  async pointCloudSmoothing(params: PointCloudSmoothingParams): Promise<PointCloudSmoothingResult> {
    try {
      const startTime = performance.now();
      
      // Make HTTP request to actual C++ backend for real benchmarking
      const response = await fetch('http://localhost:3003/api/point-smooth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          points: Array.from(params.points),
          smoothingRadius: params.smoothingRadius,
          iterations: params.iterations
        })
      });

      if (!response.ok) {
        throw new Error(`Backend request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const processingTime = performance.now() - startTime;
      
      Log.Info('PointCloudSmoothingBECPP', 'Point cloud smoothing completed using real C++ backend', {
        originalCount: result.originalCount,
        smoothedCount: result.smoothedCount,
        processingTime: `${processingTime.toFixed(2)}ms`
      });
      
      return {
        success: true,
        smoothedPoints: new Float32Array(result.smoothedPoints),
        originalCount: result.originalCount,
        smoothedCount: result.smoothedCount,
        processingTime: processingTime
      };
    } catch (error) {
      Log.Error('PointCloudSmoothingBECPP', 'Real C++ backend point cloud smoothing failed', error);
      return {
        success: false,
        originalCount: 0,
        smoothedCount: 0,
        processingTime: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  dispose(): void {
    this.removeAllObservers();
  }
}
