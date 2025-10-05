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

export class VoxelDownsampleDebugWASM extends BaseService {
  private module: any = null;

  constructor(_serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    try {
      // Load actual C++ WASM module for real benchmarking
      // The module is loaded via script tag in index.html
      if (typeof window !== 'undefined' && (window as any).ToolsModule) {
        this.module = await (window as any).ToolsModule();
        this.isInitialized = true;
        Log.Info('VoxelDownsampleDebugWASM', 'C++ WASM module loaded successfully for real benchmarking');
      } else {
        throw new Error('ToolsModule not found on window object');
      }
    } catch (error) {
      Log.Error('VoxelDownsampleDebugWASM', 'Failed to load C++ WASM module', error);
      this.isInitialized = false;
      throw new Error('C++ WASM module required for benchmarking - no fallback allowed');
    }
  }

  async generateVoxelCenters(params: VoxelDebugParams): Promise<VoxelDebugResult> {
    console.log('🔧 WASM Debug: Using C++ WASM module for voxel debug generation', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize,
      bounds: params.globalBounds
    });
    
    if (!this.isInitialized || !this.module) {
      console.error('❌ C++ WASM module not available');
      Log.Error('VoxelDownsampleDebugWASM', 'C++ WASM module required for benchmarking');
      return {
        success: false,
        error: 'C++ WASM module required for benchmarking - no fallback allowed'
      };
    }

    try {
      const startTime = performance.now();
      
      // Convert Float32Array to regular array for WASM compatibility
      const pointArray = Array.from(params.pointCloudData);
      
      // Use C++ WASM module for voxel debug generation
      const voxelResult = this.module.voxelDownsample(
        pointArray,
        params.voxelSize,
        params.globalBounds.minX,
        params.globalBounds.minY,
        params.globalBounds.minZ
      );
      
      // Extract centers from the C++ WASM result
      const voxelCenters = voxelResult;
      const processingTime = performance.now() - startTime;
      
      console.log('🔧 WASM Debug: C++ voxelDownsample result', {
        resultSize: voxelCenters ? voxelCenters.size() : 0,
        voxelSize: params.voxelSize,
        bounds: params.globalBounds
      });
      
      // Convert C++ result to Float32Array and calculate grid positions
      let centersArray: Float32Array;
      const resultSize = voxelCenters ? voxelCenters.size() : 0;
      if (resultSize === 0) {
        centersArray = new Float32Array(0);
      } else {
        // Get the original centers from C++ WASM
        const originalCenters: number[] = [];
        for (let i = 0; i < resultSize; i++) {
          const point = voxelCenters.get(i);
          originalCenters.push(point.x, point.y, point.z);
        }
        
        // Calculate voxel grid positions for proper visualization
        const voxelGridPositions: number[] = [];
        for (let i = 0; i < resultSize; i++) {
          const x = originalCenters[i * 3];
          const y = originalCenters[i * 3 + 1];
          const z = originalCenters[i * 3 + 2];
          
          // Calculate voxel grid coordinates
          const voxelX = Math.floor((x - params.globalBounds.minX) / params.voxelSize);
          const voxelY = Math.floor((y - params.globalBounds.minY) / params.voxelSize);
          const voxelZ = Math.floor((z - params.globalBounds.minZ) / params.voxelSize);
          
          // Calculate voxel grid position (center of voxel grid cell)
          const gridX = params.globalBounds.minX + (voxelX + 0.5) * params.voxelSize;
          const gridY = params.globalBounds.minY + (voxelY + 0.5) * params.voxelSize;
          const gridZ = params.globalBounds.minZ + (voxelZ + 0.5) * params.voxelSize;
          
          voxelGridPositions.push(gridX, gridY, gridZ);
        }
        
        centersArray = new Float32Array(voxelGridPositions);
      }
      
      Log.Info('VoxelDownsampleDebugWASM', 'Voxel centers generated using C++ WASM', {
        voxelCount: resultSize,
        processingTime: processingTime.toFixed(2) + 'ms'
      });

      return {
        success: true,
        voxelCenters: centersArray,
        voxelCount: resultSize,
        processingTime
      };
    } catch (error) {
      Log.Error('VoxelDownsampleDebugWASM', 'C++ WASM voxel centers generation failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }


  dispose(): void {
    this.removeAllObservers();
  }
}