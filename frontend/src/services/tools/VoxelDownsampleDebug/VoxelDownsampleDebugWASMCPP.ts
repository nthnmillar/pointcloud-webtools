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

export class VoxelDownsampleDebugWASMCPP extends BaseService {
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
        Log.Info('VoxelDownsampleDebugWASMCPP', 'C++ WASM module loaded successfully for real benchmarking');
      } else {
        throw new Error('ToolsModule not found on window object');
      }
    } catch (error) {
      Log.Error('VoxelDownsampleDebugWASMCPP', 'Failed to load C++ WASM module', error);
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
      Log.Error('VoxelDownsampleDebugWASMCPP', 'C++ WASM module required for benchmarking');
      return {
        success: false,
        error: 'C++ WASM module required for benchmarking - no fallback allowed'
      };
    }

    try {
      const startTime = performance.now();
      
      // Convert Float32Array to regular array for WASM compatibility
      const pointArray = Array.from(params.pointCloudData);
      
      // Use dedicated C++ WASM debug functions for proper benchmarking
      this.module.showVoxelDebug(
        pointArray,
        params.voxelSize
      );
      
      const processingTime = performance.now() - startTime;
      
      // Get voxel debug centers from C++ WASM (already calculated as grid positions)
      const voxelCenters = this.module.getVoxelDebugCenters();
      
      console.log('🔧 WASM Debug: C++ debug centers result', {
        resultLength: voxelCenters ? voxelCenters.length : 0,
        voxelSize: params.voxelSize,
        bounds: params.globalBounds
      });
      
      // Convert C++ result to Float32Array (already grid positions)
      let centersArray: Float32Array;
      if (!voxelCenters || voxelCenters.length === 0) {
        centersArray = new Float32Array(0);
      } else {
        // WASM debug centers are already grid positions (calculated in C++)
        centersArray = new Float32Array(voxelCenters);
      }
      
      Log.Info('VoxelDownsampleDebugWASMCPP', 'Voxel centers generated using C++ WASM', {
        voxelCount: centersArray.length / 3,
        processingTime: processingTime.toFixed(2) + 'ms'
      });

      return {
        success: true,
        voxelCenters: centersArray,
        voxelCount: centersArray.length / 3,
        processingTime
      };
    } catch (error) {
      Log.Error('VoxelDownsampleDebugWASMCPP', 'C++ WASM voxel centers generation failed', error);
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