import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';

export interface VoxelDownsampleParams {
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

export interface VoxelDownsampleResult {
  success: boolean;
  downsampledPoints?: Float32Array;
  originalCount?: number;
  downsampledCount?: number;
  processingTime?: number;
  voxelCount?: number;
  error?: string;
}

export class VoxelDownsamplingWASMCPP extends BaseService {
  private module: any = null;
  private _serviceManager: ServiceManager;

  constructor(serviceManager: ServiceManager) {
    super();
    this._serviceManager = serviceManager;
  }

  async initialize(): Promise<void> {
    try {
      Log.Info('VoxelDownsamplingWASM', 'Starting WASM initialization...');
      
      // Load the unified WASM module
      const toolsPath = new URL('/wasm/cpp/tools_cpp.js', window.location.origin);
      Log.Info('VoxelDownsamplingWASM', 'Fetching WASM JS from:', toolsPath.href);
      
      const response = await fetch(toolsPath.href);
      if (!response.ok) {
        throw new Error(`Failed to fetch WASM JS: ${response.status} ${response.statusText}`);
      }
      
      const jsCode = await response.text();
      Log.Info('VoxelDownsamplingWASM', 'WASM JS code loaded, length:', jsCode.length);
      
      // Create a function from the WASM code - handle Emscripten format
      Log.Info('VoxelDownsamplingWASM', 'Creating WASM function...');
      const wasmFunction = new Function(jsCode + '; return ToolsModule;')();
      
      Log.Info('VoxelDownsamplingWASM', 'Calling WASM function with locateFile...');
      this.module = await wasmFunction({
        locateFile: (path: string) => {
          Log.Info('VoxelDownsamplingWASM', 'locateFile called with path:', path);
          if (path.endsWith('.wasm')) {
            const wasmUrl = new URL('/wasm/cpp/tools_cpp.wasm', window.location.origin).href;
            Log.Info('VoxelDownsamplingWASM', 'Resolved WASM URL:', wasmUrl);
            return wasmUrl;
          }
          return path;
        },
      });
      
      Log.Info('VoxelDownsamplingWASM', 'WASM module loaded successfully');
      this.isInitialized = true;
    } catch (error) {
      Log.Error('VoxelDownsamplingWASM', 'Failed to initialize WASM module:', error);
      throw error;
    }
  }

  async voxelDownsample(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    if (!this.isInitialized || !this.module) {
      Log.Error('VoxelDownsamplingWASM', 'WASM module not available');
      return {
        success: false,
        error: 'WASM module not available'
      };
    }

    try {
      const startTime = performance.now();
      
      Log.Info('VoxelDownsamplingWASM', 'Calling WASM function with params', {
        pointCloudDataLength: params.pointCloudData.length,
        voxelSize: params.voxelSize,
        bounds: params.globalBounds,
        firstFewPoints: Array.from(params.pointCloudData.slice(0, 9))
      });
      
      // Convert Float32Array to regular array for WASM compatibility
      const pointArray = Array.from(params.pointCloudData);
      
      Log.Info('VoxelDownsamplingWASM', 'Converted to array', {
        pointArrayLength: pointArray.length,
        firstFewArrayValues: pointArray.slice(0, 9),
        voxelSize: params.voxelSize,
        bounds: params.globalBounds
      });
      
      // Call the unified WASM module's voxelDownsample function
      let result;
      try {
        result = this.module.voxelDownsample(
          pointArray,
          params.voxelSize,
          params.globalBounds.minX,
          params.globalBounds.minY,
          params.globalBounds.minZ
        );
      } catch (error) {
        Log.Error('VoxelDownsamplingWASM', 'WASM function threw error', error);
        throw error;
      }

      const processingTime = performance.now() - startTime;
      
      Log.Info('VoxelDownsamplingWASM', 'WASM function returned', {
        resultType: typeof result,
        resultLength: result ? result.size() : 'undefined',
        result: result,
        resultIsArray: Array.isArray(result),
        resultConstructor: result ? result.constructor.name : 'undefined'
      });

      // Convert result to Float32Array
      // The WASM function returns a vector of Point3D objects
      let downsampledPoints: Float32Array;
      const resultSize = result ? result.size() : 0;
      if (resultSize === 0) {
        Log.Warn('VoxelDownsamplingWASM', 'WASM function returned empty result', {
          voxelSize: params.voxelSize,
          bounds: params.globalBounds,
          pointCount: params.pointCloudData.length / 3
        });
        downsampledPoints = new Float32Array(0);
      } else {
        downsampledPoints = new Float32Array(resultSize * 3);
        for (let i = 0; i < resultSize; i++) {
          const point = result.get(i);
          downsampledPoints[i * 3] = point.x;
          downsampledPoints[i * 3 + 1] = point.y;
          downsampledPoints[i * 3 + 2] = point.z;
        }
      }
      
      Log.Info('VoxelDownsamplingWASM', 'Converted to Float32Array', {
        downsampledPointsLength: downsampledPoints.length
      });

              return {
                success: true,
                downsampledPoints,
                originalCount: params.pointCloudData.length / 3,
                downsampledCount: resultSize,
                processingTime,
                voxelCount: resultSize
              };
    } catch (error) {
      Log.Error('VoxelDownsamplingWASM', 'Voxel downsampling failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }


  dispose(): void {
    this.module = null;
    this.removeAllObservers();
  }
}
