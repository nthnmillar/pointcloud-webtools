import { BaseService } from '../BaseService';
import { ToolsService } from './ToolsService';
import type {
  VoxelModule as VoxelModuleType,
} from '../../wasm/VoxelModule.d.ts';

export interface VoxelDownsampleParams {
  voxelSize: number;
  pointCloudData?: Float32Array;
}

export interface VoxelDownsampleResult {
  success: boolean;
  downsampledPoints?: Float32Array;
  originalCount?: number;
  downsampledCount?: number;
  processingTime?: number;
  error?: string;
}

export class VoxelDownsampling extends BaseService {
  private _isProcessing: boolean = false;
  private _currentVoxelSize: number = 0.1;
  private _toolsService?: ToolsService;
  private _voxelModule?: VoxelModuleType;

  constructor(toolsService?: ToolsService) {
    super();
    this._toolsService = toolsService;
  }

  async initialize(): Promise<void> {
    try {
      // Load WASM module using fetch and eval
      const response = await fetch('/wasm/voxel_downsampling.js');
      const jsCode = await response.text();

      // Create a module function
      const moduleFunction = new Function('module', 'exports', jsCode);

      // Create module object
      const module = { exports: {} };
      moduleFunction(module, module.exports);

      // Get the VoxelModule function
      const VoxelModule = (module.exports as { default?: (options?: { locateFile?: (path: string) => string }) => Promise<VoxelModuleType> }).default || module.exports as (options?: { locateFile?: (path: string) => string }) => Promise<VoxelModuleType>;

      if (typeof VoxelModule !== 'function') {
        throw new Error('VoxelModule is not a function: ' + typeof VoxelModule);
      }

      this._voxelModule = await VoxelModule({
        locateFile: (path: string) => {
          if (path.endsWith('.wasm')) {
            return '/wasm/voxel_downsampling.wasm';
          }
          return path;
        },
      });

      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  // Getters
  get isProcessing(): boolean {
    return this._isProcessing;
  }

  get currentVoxelSize(): number {
    return this._currentVoxelSize;
  }

  // Setters
  setVoxelSize(size: number): void {
    if (size < 0.01 || size > 1.0) {
      throw new Error('Voxel size must be between 0.01 and 1.0 meters');
    }
    this._currentVoxelSize = size;
    this.emit('voxelSizeChanged', { voxelSize: size });
    this._toolsService?.forwardEvent('voxelSizeChanged', { voxelSize: size });
  }

  // WASM Voxel Downsampling
  async voxelDownsampleWasm(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    if (this._isProcessing) {
      throw new Error('Another processing operation is already in progress');
    }

    this._isProcessing = true;
    this.emit('processingStarted', {
      operation: 'voxelDownsampleWasm',
      params,
    });
    this._toolsService?.forwardEvent('processingStarted', {
      operation: 'voxelDownsampleWasm',
      params,
    });

    try {
      const startTime = performance.now();

      // Check if module is loaded, if not try to initialize
      if (!this._voxelModule) {
        await this.initialize();
        if (!this._voxelModule) {
          throw new Error(
            'Failed to load WASM module after initialization attempt'
          );
        }
      }

      if (!params.pointCloudData) {
        throw new Error('No point cloud data provided');
      }

      // Pass Float32Array directly like LAZ loader does
      const downsampledPoints = this._voxelModule.voxelDownsample(
        params.pointCloudData,
        params.voxelSize
      );

      // Convert Emscripten vector back to Float32Array
      let resultLength = 0;
      if (typeof downsampledPoints.size === 'function') {
        resultLength = downsampledPoints.size();
      } else if (downsampledPoints.length) {
        resultLength = downsampledPoints.length;
      }

      const downsampledFloat32 = new Float32Array(resultLength * 3);

      for (let i = 0; i < resultLength; i++) {
        let point;
        if (typeof downsampledPoints.get === 'function') {
          point = downsampledPoints.get(i);
        } else if (typeof downsampledPoints.at === 'function') {
          point = downsampledPoints.at(i);
        } else if (downsampledPoints[i]) {
          point = downsampledPoints[i];
        } else {
          continue;
        }

        if (point && typeof point.x === 'number') {
          downsampledFloat32[i * 3] = point.x;
          downsampledFloat32[i * 3 + 1] = point.y;
          downsampledFloat32[i * 3 + 2] = point.z;
        }
      }

      const processingTime = performance.now() - startTime;

      const result: VoxelDownsampleResult = {
        success: true,
        downsampledPoints: downsampledFloat32,
        originalCount: params.pointCloudData.length / 3,
        downsampledCount: resultLength,
        processingTime,
      };

      this.emit('processingCompleted', {
        operation: 'voxelDownsampleWasm',
        result,
      });
      this._toolsService?.forwardEvent('processingCompleted', {
        operation: 'voxelDownsampleWasm',
        result,
      });
      return result;
    } catch (error) {
      const errorResult: VoxelDownsampleResult = {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };

      this.emit('processingError', {
        operation: 'voxelDownsampleWasm',
        error: errorResult.error,
      });
      this._toolsService?.forwardEvent('processingError', {
        operation: 'voxelDownsampleWasm',
        error: errorResult.error,
      });
      return errorResult;
    } finally {
      this._isProcessing = false;
      this.emit('processingFinished', { operation: 'voxelDownsampleWasm' });
      this._toolsService?.forwardEvent('processingFinished', {
        operation: 'voxelDownsampleWasm',
      });
    }
  }

  // Backend Voxel Downsampling
  async voxelDownsampleBackend(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    if (this._isProcessing) {
      throw new Error('Another processing operation is already in progress');
    }

    this._isProcessing = true;
    this.emit('processingStarted', {
      operation: 'voxelDownsampleBackend',
      params,
    });
    this._toolsService?.forwardEvent('processingStarted', {
      operation: 'voxelDownsampleBackend',
      params,
    });

    try {
      const startTime = performance.now();

      // TODO: Replace with actual backend API call
      // const response = await fetch('/api/voxel-downsample', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     voxelSize: params.voxelSize,
      //     pointCloudData: Array.from(params.pointCloudData || [])
      //   })
      // });
      // const result = await response.json();

      // Simulate processing for now
      await new Promise(resolve => setTimeout(resolve, 1500));

      const processingTime = performance.now() - startTime;

      const result: VoxelDownsampleResult = {
        success: true,
        // downsampledPoints: new Float32Array(result.downsampledPoints),
        originalCount: params.pointCloudData
          ? params.pointCloudData.length / 3
          : 0,
        downsampledCount: params.pointCloudData
          ? Math.floor((params.pointCloudData.length / 3) * 0.25)
          : 0,
        processingTime,
      };

      this.emit('processingCompleted', {
        operation: 'voxelDownsampleBackend',
        result,
      });
      this._toolsService?.forwardEvent('processingCompleted', {
        operation: 'voxelDownsampleBackend',
        result,
      });
      return result;
    } catch (error) {
      const errorResult: VoxelDownsampleResult = {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };

      this.emit('processingError', {
        operation: 'voxelDownsampleBackend',
        error: errorResult.error,
      });
      this._toolsService?.forwardEvent('processingError', {
        operation: 'voxelDownsampleBackend',
        error: errorResult.error,
      });
      return errorResult;
    } finally {
      this._isProcessing = false;
      this.emit('processingFinished', { operation: 'voxelDownsampleBackend' });
      this._toolsService?.forwardEvent('processingFinished', {
        operation: 'voxelDownsampleBackend',
      });
    }
  }

  dispose(): void {
    this._isProcessing = false;
    this.removeAllObservers();
  }
}
