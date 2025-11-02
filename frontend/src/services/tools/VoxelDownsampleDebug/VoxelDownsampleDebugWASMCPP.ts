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
      // Prefer global module if present (legacy load via script tag)
      if (typeof window !== 'undefined' && (window as any).ToolsModule) {
        this.module = await (window as any).ToolsModule();
        this.isInitialized = true;
        Log.Info('VoxelDownsampleDebugWASMCPP', 'C++ WASM module loaded from window.ToolsModule');
        return;
      }

      // Fallback: dynamic import like other services (robust to load order)
      Log.Info('VoxelDownsampleDebugWASMCPP', 'window.ToolsModule not found, attempting dynamic import');
      // Note: this file is one directory deeper than WasmFirstService, so we need an extra '../'
      const ToolsModuleNs: any = await import('../../../../public/wasm/cpp/tools_cpp.js');
      const factory = ToolsModuleNs.default || ToolsModuleNs.ToolsModule;
      if (!factory) {
        throw new Error('WASM module factory not found in tools_cpp.js');
      }
      this.module = await factory();
      this.isInitialized = true;
      Log.Info('VoxelDownsampleDebugWASMCPP', 'C++ WASM module loaded via dynamic import');
    } catch (error) {
      Log.Error('VoxelDownsampleDebugWASMCPP', 'Failed to load C++ WASM module', error);
      this.isInitialized = false;
      throw new Error('C++ WASM module required for benchmarking - no fallback allowed');
    }
  }

  async generateVoxelCenters(params: VoxelDebugParams): Promise<VoxelDebugResult> {
    // Ensure module is initialized (handles cases where init didn't run yet)
    if (!this.isInitialized || !this.module) {
      try {
        await this.initialize();
      } catch (e) {
        Log.Error('VoxelDownsampleDebugWASMCPP', 'Initialization failed on first use', e);
        return { success: false, error: 'C++ WASM module required for benchmarking - no fallback allowed' };
      }
    }

    console.log('🔧 WASM Debug: Using C++ WASM module for voxel debug generation', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize,
      bounds: params.globalBounds
    });
    
    // Double-check after init attempt
    if (!this.isInitialized || !this.module) {
      return { success: false, error: 'C++ WASM module required for benchmarking - no fallback allowed' };
    }

    try {
      const startTime = performance.now();
      
      // Pass bounds to C++ to match TypeScript/Rust (ensures identical results)
      this.module.showVoxelDebug(
        params.pointCloudData,  // Direct Float32Array - no conversion!
        params.voxelSize,
        params.globalBounds.minX,
        params.globalBounds.minY,
        params.globalBounds.minZ
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