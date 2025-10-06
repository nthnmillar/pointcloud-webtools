import { BaseService } from '../../BaseService';
import { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';

// Import the Rust WASM module
import init, { PointCloudToolsRust } from '../../../../public/wasm/rust/tools_rust.js';

export class PointCloudSmoothingWASMRust extends BaseService {
  private wasmModule: PointCloudToolsRust | null = null;

  constructor(_serviceManager: ServiceManager) {
    super();
    Log.Info('PointCloudSmoothingWASMRust', 'Rust WASM point cloud smoothing service created');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      Log.Info('PointCloudSmoothingWASMRust', 'Starting Rust WASM initialization...');
      
      // Initialize the Rust WASM module
      await init();
      
      // Create the Rust tools instance
      this.wasmModule = new PointCloudToolsRust();
      
      this.isInitialized = true;
      Log.Info('PointCloudSmoothingWASMRust', 'Rust WASM module loaded successfully for real benchmarking');
    } catch (error) {
      Log.Error('PointCloudSmoothingWASMRust', 'Failed to initialize Rust WASM module', error);
      throw error;
    }
  }

  async performPointCloudSmoothing(
    pointCloudData: Float32Array,
    smoothingRadius: number,
    iterations: number
  ): Promise<{
    success: boolean;
    smoothedPoints?: Float32Array;
    processingTime?: number;
    error?: string;
  }> {
    if (!this.isInitialized || !this.wasmModule) {
      throw new Error('Rust WASM module not initialized');
    }

    const startTime = performance.now();

    try {
      Log.Info('PointCloudSmoothingWASMRust', 'Starting Rust WASM point cloud smoothing', {
        pointCount: pointCloudData.length / 3,
        smoothingRadius,
        iterations
      });

      // Convert Float32Array to Float64Array for Rust WASM
      const pointsArray = new Float64Array(pointCloudData);

      // Call Rust WASM point cloud smoothing
      console.log('🔧 RUST SMOOTHING: Calling point_cloud_smooth with:', {
        pointsLength: pointsArray.length,
        smoothingRadius,
        iterations
      });
      
      const result = this.wasmModule.point_cloud_smooth(
        pointsArray,
        smoothingRadius,
        iterations
      );
      
      console.log('🔧 RUST SMOOTHING: point_cloud_smooth returned:', {
        resultLength: result.length,
        pointCount: result.length / 3
      });

      const processingTime = performance.now() - startTime;

      Log.Info('PointCloudSmoothingWASMRust', 'Rust WASM point cloud smoothing completed', {
        pointCount: pointCloudData.length / 3,
        processingTime: processingTime.toFixed(2) + 'ms'
      });

      // Convert result back to Float32Array
      const smoothedPoints = new Float32Array(result);

      return {
        success: true,
        smoothedPoints,
        processingTime
      };
    } catch (error) {
      const processingTime = performance.now() - startTime;
      Log.Error('PointCloudSmoothingWASMRust', 'Rust WASM point cloud smoothing failed', error);
      
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
    Log.Info('PointCloudSmoothingWASMRust', 'Rust WASM point cloud smoothing service disposed');
  }
}
