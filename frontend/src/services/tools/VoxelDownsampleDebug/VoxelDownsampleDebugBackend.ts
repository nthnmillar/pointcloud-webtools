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

export class VoxelDownsampleDebugBackend extends BaseService {
  constructor(_serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
    Log.Info('VoxelDownsampleDebugBackend', 'Backend debug service initialized for C++ processing');
  }

  async generateVoxelCenters(params: VoxelDebugParams): Promise<VoxelDebugResult> {
    console.log('🔧 Backend Debug: Using real C++ backend processing for voxel debug generation', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize,
      bounds: params.globalBounds
    });
    
    try {
      const startTime = performance.now();
      
      // Make HTTP request to actual C++ backend for real benchmarking
      const response = await fetch('http://localhost:3003/api/voxel-debug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pointCloudData: Array.from(params.pointCloudData),
          voxelSize: params.voxelSize,
          globalBounds: params.globalBounds
        })
      });
      
      if (!response.ok) {
        throw new Error(`Backend request failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Backend processing failed');
      }
      
      // Convert backend result to Float32Array
      const voxelCenters = new Float32Array(result.voxelCenters || []);
      const processingTime = performance.now() - startTime;
      
      console.log('🔧 Backend Debug: Real C++ backend result', {
        voxelCount: result.voxelCount || 0,
        processingTime: processingTime.toFixed(2) + 'ms'
      });
      
      Log.Info('VoxelDownsampleDebugBackend', 'Voxel centers generated using real C++ backend', {
        voxelCount: result.voxelCount || 0,
        processingTime: processingTime.toFixed(2) + 'ms'
      });

      return {
        success: true,
        voxelCenters: voxelCenters,
        voxelCount: result.voxelCount || 0,
        processingTime
      };
    } catch (error) {
      Log.Error('VoxelDownsampleDebugBackend', 'Real C++ backend voxel centers generation failed', error);
      
      // No fallback - BE must use real C++ processing for benchmarking
      console.log('🔧 Backend Debug: No fallback allowed - BE must use real C++ processing');
      
      
      return {
        success: false,
        error: 'Backend C++ processing required for benchmarking - no fallback allowed'
      };
    }
  }

  dispose(): void {
    // Cleanup implementation if needed
  }
}
