import { BaseService } from '../../BaseService';
import { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';
import type { VoxelDebugParams, VoxelDebugResult } from './VoxelDownsampleDebugService';

// Import the Rust WASM module
import init, { PointCloudToolsRust } from '../../../../public/wasm/rust/tools_rust.js';

export class VoxelDownsampleDebugWASMRust extends BaseService {
  private wasmModule: PointCloudToolsRust | null = null;

  constructor(_serviceManager: ServiceManager) {
    super();
    Log.Info('VoxelDownsampleDebugWASMRust', 'Rust WASM voxel debug service created');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      Log.Info('VoxelDownsampleDebugWASMRust', 'Starting Rust WASM initialization...');
      
      // Initialize the Rust WASM module
      await init();
      
      // Create the Rust tools instance
      this.wasmModule = new PointCloudToolsRust();
      
      this.isInitialized = true;
      Log.Info('VoxelDownsampleDebugWASMRust', 'Rust WASM module loaded successfully for real benchmarking');
    } catch (error) {
      Log.Error('VoxelDownsampleDebugWASMRust', 'Failed to initialize Rust WASM module', error);
      throw error;
    }
  }

  async generateVoxelCenters(params: VoxelDebugParams): Promise<VoxelDebugResult> {
    if (!this.isInitialized || !this.wasmModule) {
      try {
        await this.initialize();
      } catch (e) {
        return { success: false, error: 'Rust WASM module not initialized' };
      }
    }

    const startTime = performance.now();

    try {
      Log.Info('VoxelDownsampleDebugWASMRust', 'Starting Rust WASM voxel center generation', {
        pointCount: params.pointCloudData.length / 3,
        voxelSize: params.voxelSize,
        bounds: params.globalBounds
      });

      // OPTIMIZATION: Use direct Float32Array - Rust can handle f32 directly
      // No conversion needed - Rust WASM accepts &[f32] directly from Float32Array
      const result = this.wasmModule.generate_voxel_centers(
        params.pointCloudData,  // Direct Float32Array - zero conversion!
        params.voxelSize,
        params.globalBounds.minX,
        params.globalBounds.minY,
        params.globalBounds.minZ
      );
      
      console.log('🔧 RUST DEBUG: generate_voxel_centers returned:', {
        resultLength: result.length,
        voxelCount: result.length / 3
      });

      const processingTime = performance.now() - startTime;
      const voxelCount = result.length / 3;

      Log.Info('VoxelDownsampleDebugWASMRust', 'Rust WASM voxel center generation completed', {
        pointCount: params.pointCloudData.length / 3,
        voxelCount,
        processingTime: processingTime.toFixed(2) + 'ms'
      });

      // Convert result back to Float32Array
      const voxelCenters = new Float32Array(result);

      return {
        success: true,
        voxelCenters,
        voxelCount,
        processingTime
      };
    } catch (error) {
      const processingTime = performance.now() - startTime;
      Log.Error('VoxelDownsampleDebugWASMRust', 'Rust WASM voxel center generation failed', error);
      
      return {
        success: false,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  dispose(): void {
    this.wasmModule = null;
    this.isInitialized = false;
    Log.Info('VoxelDownsampleDebugWASMRust', 'Rust WASM voxel debug service disposed');
  }
}
