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
          Log.Info('PointCloudSmoothingBECPP', `Backend not ready, retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        // If it's not a network error or we've exhausted retries, throw
        throw error;
      }
    }
    
    throw lastError;
  }

  async pointCloudSmoothing(params: PointCloudSmoothingParams): Promise<PointCloudSmoothingResult> {
    try {
      const startTime = performance.now();
      
      // Use retry mechanism for backend request
      const result = await this.retryBackendRequest(async () => {
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

        return await response.json();
      });

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
      Log.Error('PointCloudSmoothingBECPP', 'Real C++ backend point cloud smoothing failed after retries', error);
      
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
