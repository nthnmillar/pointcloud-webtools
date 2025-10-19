import { BaseService } from '../../BaseService';
import { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';

// Import the Rust WASM module
import init, { PointCloudToolsRust } from '../../../../public/wasm/rust/tools_rust.js';

export class VoxelDownsamplingWASMRust extends BaseService {
  private wasmModule: PointCloudToolsRust | null = null;

  constructor(_serviceManager: ServiceManager) {
    super();
    Log.Info('VoxelDownsamplingWASMRust', 'Rust WASM voxel downsampling service created');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('🔧 Rust WASM: Starting initialization...');
      Log.Info('VoxelDownsamplingWASMRust', 'Starting Rust WASM initialization...');
      
      // Initialize the Rust WASM module
      console.log('🔧 Rust WASM: Calling init()...');
      await init();
      console.log('🔧 Rust WASM: init() completed');
      
      // Create the Rust tools instance
      console.log('🔧 Rust WASM: Creating PointCloudToolsRust instance...');
      this.wasmModule = new PointCloudToolsRust();
      console.log('🔧 Rust WASM: PointCloudToolsRust instance created:', this.wasmModule);
      
      this.isInitialized = true;
      console.log('🔧 Rust WASM: Initialization completed successfully');
      Log.Info('VoxelDownsamplingWASMRust', 'Rust WASM module loaded successfully for real benchmarking');
    } catch (error) {
      console.error('🔧 Rust WASM: Initialization failed:', error);
      Log.Error('VoxelDownsamplingWASMRust', 'Failed to initialize Rust WASM module', error);
      throw error;
    }
  }

  async performVoxelDownsampling(
    pointCloudData: Float32Array,
    voxelSize: number,
    globalBounds: {
      minX: number;
      minY: number;
      minZ: number;
      maxX: number;
      maxY: number;
      maxZ: number;
    }
  ): Promise<{
    success: boolean;
    downsampledPoints?: Float32Array;
    voxelCount?: number;
    processingTime?: number;
    error?: string;
  }> {
    console.log('🔧 Rust WASM: performVoxelDownsampling called', {
      isInitialized: this.isInitialized,
      wasmModule: !!this.wasmModule,
      pointCount: pointCloudData.length / 3,
      voxelSize,
      bounds: globalBounds
    });
    
    if (!this.isInitialized || !this.wasmModule) {
      console.error('🔧 Rust WASM: Module not initialized!', {
        isInitialized: this.isInitialized,
        wasmModule: !!this.wasmModule
      });
      throw new Error('Rust WASM module not initialized');
    }

    const startTime = performance.now();

    try {
      Log.Info('VoxelDownsamplingWASMRust', 'Starting Rust WASM voxel downsampling', {
        pointCount: pointCloudData.length / 3,
        voxelSize,
        bounds: globalBounds
      });

      // Call Rust WASM voxel downsampling (now optimized with integer hash keys)
      console.log('🔧 Rust WASM: Calling optimized voxel downsampling with:', {
        pointsLength: pointCloudData.length,
        voxelSize,
        bounds: { minX: globalBounds.minX, minY: globalBounds.minY, minZ: globalBounds.minZ }
      });
      
      const result = this.wasmModule.voxel_downsample(
        pointCloudData,
        voxelSize,
        globalBounds.minX,
        globalBounds.minY,
        globalBounds.minZ
      );
      
      console.log('🔧 Rust WASM: Got result:', {
        resultLength: result.length,
        firstFew: Array.from(result).slice(0, 9)
      });

      const processingTime = performance.now() - startTime;
      const voxelCount = result.length / 3;

      Log.Info('VoxelDownsamplingWASMRust', 'Rust WASM voxel downsampling completed', {
        originalCount: pointCloudData.length / 3,
        voxelCount,
        processingTime: processingTime.toFixed(2) + 'ms'
      });

      // Convert result back to Float32Array
      const downsampledPoints = new Float32Array(result);

      return {
        success: true,
        downsampledPoints,
        voxelCount,
        processingTime
      };
    } catch (error) {
      const processingTime = performance.now() - startTime;
      Log.Error('VoxelDownsamplingWASMRust', 'Rust WASM voxel downsampling failed', error);
      
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
    Log.Info('VoxelDownsamplingWASMRust', 'Rust WASM voxel downsampling service disposed');
  }
}

