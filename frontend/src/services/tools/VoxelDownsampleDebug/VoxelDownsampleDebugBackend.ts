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
      
      // Fallback to TS algorithm when backend is not available
      console.log('🔧 Backend Debug: Falling back to TS algorithm (backend unavailable)');
      
      const startTime = performance.now();
      const pointCount = params.pointCloudData.length / 3;
      const voxelMap = new Map();
      
      // Process each point to find voxel centers (TS algorithm)
      for (let i = 0; i < pointCount; i++) {
        const x = params.pointCloudData[i * 3];
        const y = params.pointCloudData[i * 3 + 1];
        const z = params.pointCloudData[i * 3 + 2];
        
        // Calculate voxel coordinates
        const voxelX = Math.floor((x - params.globalBounds.minX) / params.voxelSize);
        const voxelY = Math.floor((y - params.globalBounds.minY) / params.voxelSize);
        const voxelZ = Math.floor((z - params.globalBounds.minZ) / params.voxelSize);
        
        const voxelKey = `${voxelX},${voxelY},${voxelZ}`;
        
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
      
      // Calculate voxel grid positions for proper visualization
      const voxelGridPositions: number[] = [];
      for (const [voxelKey] of voxelMap) {
        const [voxelX, voxelY, voxelZ] = voxelKey.split(',').map(Number);
        
        // Calculate voxel grid position (center of voxel grid cell)
        const gridX = params.globalBounds.minX + (voxelX + 0.5) * params.voxelSize;
        const gridY = params.globalBounds.minY + (voxelY + 0.5) * params.voxelSize;
        const gridZ = params.globalBounds.minZ + (voxelZ + 0.5) * params.voxelSize;
        
        voxelGridPositions.push(gridX, gridY, gridZ);
      }
      
      const processingTime = performance.now() - startTime;
      const voxelCenters = new Float32Array(voxelGridPositions);
      
      return {
        success: true,
        voxelCenters: voxelCenters,
        voxelCount: voxelMap.size,
        processingTime
      };
    }
  }

  dispose(): void {
    // Cleanup implementation if needed
  }
}
