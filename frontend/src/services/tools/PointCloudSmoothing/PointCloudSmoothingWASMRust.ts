import { BaseService } from '../../BaseService';
import { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';
import type {
  PointCloudSmoothingParams,
  PointCloudSmoothingResult,
} from '../ToolsService';

// Import the Rust WASM module
import init, {
  PointCloudToolsRust,
} from '../../../../public/wasm/rust/tools_rust.js';

export class PointCloudSmoothingWASMRust extends BaseService {
  private wasmModule: PointCloudToolsRust | null = null;

  constructor(_serviceManager: ServiceManager) {
    super();
    Log.Info(
      'PointCloudSmoothingWASMRust',
      'Rust WASM point cloud smoothing service created'
    );
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      Log.Info(
        'PointCloudSmoothingWASMRust',
        'Starting Rust WASM initialization...'
      );

      // Initialize the Rust WASM module
      await init();

      // Create the Rust tools instance
      this.wasmModule = new PointCloudToolsRust();

      this.isInitialized = true;
      Log.Info(
        'PointCloudSmoothingWASMRust',
        'Rust WASM module loaded successfully for real benchmarking'
      );
    } catch (error) {
      Log.Error(
        'PointCloudSmoothingWASMRust',
        'Failed to initialize Rust WASM module',
        error
      );
      throw error;
    }
  }

  async performPointCloudSmoothing(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    if (!this.isInitialized || !this.wasmModule) {
      return {
        success: false,
        error: 'Rust WASM module not initialized',
      };
    }

    const startTime = performance.now();

    try {
      Log.Info(
        'PointCloudSmoothingWASMRust',
        'Starting Rust WASM point cloud smoothing',
        {
          pointCount: params.points.length / 3,
          smoothingRadius: params.smoothingRadius,
          iterations: params.iterations,
        }
      );

      // Call Rust WASM point cloud smoothing
      const result = this.wasmModule.point_cloud_smooth(
        params.points,
        params.smoothingRadius,
        params.iterations
      );

      const processingTime = performance.now() - startTime;

      Log.Info(
        'PointCloudSmoothingWASMRust',
        'Rust WASM point cloud smoothing completed',
        {
          pointCount: params.points.length / 3,
          processingTime: processingTime.toFixed(2) + 'ms',
        }
      );

      const smoothedPoints = result;
      const pointCount = smoothedPoints.length / 3;
      // Pass through attributes (point count and order unchanged)
      const smoothedColors =
        params.colors != null && params.colors.length === pointCount * 3
          ? new Float32Array(params.colors)
          : undefined;
      const smoothedIntensities =
        params.intensities != null && params.intensities.length === pointCount
          ? new Float32Array(params.intensities)
          : undefined;
      const smoothedClassifications =
        params.classifications != null &&
        params.classifications.length === pointCount
          ? new Uint8Array(params.classifications)
          : undefined;

      return {
        success: true,
        smoothedPoints,
        smoothedColors,
        smoothedIntensities,
        smoothedClassifications,
        originalCount: params.points.length / 3,
        smoothedCount: pointCount,
        processingTime,
      };
    } catch (error) {
      const processingTime = performance.now() - startTime;
      Log.Error(
        'PointCloudSmoothingWASMRust',
        'Rust WASM point cloud smoothing failed',
        error
      );

      return {
        success: false,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  dispose(): void {
    this.wasmModule = null;
    this.isInitialized = false;
    Log.Info(
      'PointCloudSmoothingWASMRust',
      'Rust WASM point cloud smoothing service disposed'
    );
  }
}
