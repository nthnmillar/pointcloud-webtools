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
    originalCount?: number;
    smoothedCount?: number;
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

      // Use Float32Array directly for Rust WASM (now uses f32)
      const pointsArray = pointCloudData;

      // Call Rust WASM point cloud smoothing
      const result = this.wasmModule.point_cloud_smooth(
        pointsArray,
        smoothingRadius,
        iterations
      );

      const processingTime = performance.now() - startTime;

      Log.Info('PointCloudSmoothingWASMRust', 'Rust WASM point cloud smoothing completed', {
        pointCount: pointCloudData.length / 3,
        processingTime: processingTime.toFixed(2) + 'ms'
      });

      // Result is already Float32Array (Rust WASM now returns f32)
      const smoothedPoints = result;
      const originalCount = pointCloudData.length / 3;
      const smoothedCount = smoothedPoints.length / 3;

      return {
        success: true,
        smoothedPoints,
        originalCount,
        smoothedCount,
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
