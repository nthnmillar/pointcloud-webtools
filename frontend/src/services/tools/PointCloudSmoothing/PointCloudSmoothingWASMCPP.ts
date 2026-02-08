import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';
import type {
  PointCloudSmoothingParams,
  PointCloudSmoothingResult,
} from '../ToolsService';

interface ToolsWasmModule {
  pointCloudSmoothing(
    points: Float32Array,
    smoothingRadius: number,
    iterations: number
  ): Float32Array;
}

export class PointCloudSmoothingWASMCPP extends BaseService {
  private module: ToolsWasmModule | null = null;

  constructor(_serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    try {
      Log.Info('PointCloudSmoothingWASMCPP', 'Starting WASM initialization...');

      // Load the unified WASM module
      const toolsPath = new URL('/wasm/cpp/tools_cpp.js', self.location.origin);
      Log.Info(
        'PointCloudSmoothingWASMCPP',
        'Fetching WASM JS from:',
        toolsPath.href
      );

      const response = await fetch(toolsPath.href);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch WASM JS: ${response.status} ${response.statusText}`
        );
      }

      const jsCode = await response.text();
      Log.Info(
        'PointCloudSmoothingWASMCPP',
        'WASM JS code loaded, length:',
        jsCode.length
      );

      // Create a function from the WASM code - handle Emscripten format
      Log.Info('PointCloudSmoothingWASMCPP', 'Creating WASM function...');
      const wasmFunction = new Function(jsCode + '; return ToolsModule;')();

      Log.Info(
        'PointCloudSmoothingWASMCPP',
        'Calling WASM function with locateFile...'
      );
      this.module = await wasmFunction({
        locateFile: (path: string) => {
          Log.Info(
            'PointCloudSmoothingWASMCPP',
            'locateFile called with path:',
            path
          );
          if (path.endsWith('.wasm')) {
            const wasmUrl = new URL(
              '/wasm/cpp/tools_cpp.wasm',
              self.location.origin
            ).href;
            Log.Info(
              'PointCloudSmoothingWASMCPP',
              'Resolved WASM URL:',
              wasmUrl
            );
            return wasmUrl;
          }
          return path;
        },
      });

      Log.Info('PointCloudSmoothingWASMCPP', 'WASM module loaded successfully');
      this.isInitialized = true;
    } catch (error) {
      Log.Error(
        'PointCloudSmoothingWASMCPP',
        'Failed to initialize WASM module:',
        error
      );
      throw error;
    }
  }

  async pointCloudSmoothing(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    if (!this.isInitialized || !this.module) {
      Log.Error('PointCloudSmoothingWASMCPP', 'WASM module not available');
      return {
        success: false,
        error: 'WASM module not available',
      };
    }

    try {
      const startTime = performance.now();

      // Call the unified WASM module's pointCloudSmoothing function
      const result = this.module.pointCloudSmoothing(
        params.points,
        params.smoothingRadius,
        params.iterations
      );

      const processingTime = performance.now() - startTime;
      const pointCount = result.length / 3;
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
        smoothedPoints: result,
        smoothedColors,
        smoothedIntensities,
        smoothedClassifications,
        originalCount: params.points.length / 3,
        smoothedCount: pointCount,
        processingTime,
      };
    } catch (error) {
      Log.Error(
        'PointCloudSmoothingWASMCPP',
        'Point cloud smoothing failed',
        error
      );
      return {
        success: false,
        originalCount: 0,
        smoothedCount: 0,
        processingTime: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  dispose(): void {
    this.module = null;
    this.removeAllObservers();
  }
}
