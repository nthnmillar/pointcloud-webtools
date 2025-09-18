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
      console.log('=== VoxelDownsampling.initialize() called ===');

      // Load WASM module using fetch and eval
      console.log('Loading WASM module...');

      // Load the JavaScript file
      console.log('Fetching /wasm/voxel_downsampling.js...');
      const response = await fetch('/wasm/voxel_downsampling.js');
      console.log('Fetch response:', response.status, response.ok);

      const jsCode = await response.text();
      console.log('JavaScript code length:', jsCode.length);

      // Create a module function
      console.log('Creating module function...');
      const moduleFunction = new Function('module', 'exports', jsCode);

      // Create module object
      const module = { exports: {} };
      console.log('Executing module function...');
      moduleFunction(module, module.exports);
      console.log('Module exports:', module.exports);

      // Get the VoxelModule function
      const VoxelModule = (module.exports as { default?: VoxelModuleType }).default || module.exports as VoxelModuleType;
      console.log('VoxelModule function:', typeof VoxelModule, VoxelModule);

      if (typeof VoxelModule !== 'function') {
        throw new Error('VoxelModule is not a function: ' + typeof VoxelModule);
      }

      console.log('Calling VoxelModule with options...');
      this._voxelModule = await VoxelModule({
        locateFile: (path: string) => {
          console.log('locateFile called with:', path);
          if (path.endsWith('.wasm')) {
            return '/wasm/voxel_downsampling.wasm';
          }
          return path;
        },
      });

      console.log('WASM module initialized successfully:', this._voxelModule);
      this.isInitialized = true;
      console.log('=== VoxelDownsampling.initialize() completed ===');
    } catch (error) {
      console.error('=== VoxelDownsampling.initialize() FAILED ===');
      console.error('Error details:', error);
      console.error('Error stack:', error.stack);
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
        console.log('WASM module not loaded, attempting to initialize...');
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
      console.log('Passing Float32Array directly to WASM...');
      console.log('Input data length:', params.pointCloudData.length);
      console.log('Expected points:', params.pointCloudData.length / 3);
      console.log('Voxel size:', params.voxelSize);

      // Call WASM function with Float32Array directly
      console.log('Calling WASM voxelDownsample...');
      const downsampledPoints = this._voxelModule.voxelDownsample(
        params.pointCloudData,
        params.voxelSize
      );
      console.log('WASM returned:', downsampledPoints);
      console.log('WASM returned type:', typeof downsampledPoints);
      console.log(
        'WASM returned length:',
        downsampledPoints?.length || 'no length property'
      );

      // Convert Emscripten vector back to Float32Array
      console.log('Converting WASM result back to Float32Array...');
      console.log('WASM result details:', {
        hasSize: typeof downsampledPoints.size === 'function',
        hasGet: typeof downsampledPoints.get === 'function',
        hasAt: typeof downsampledPoints.at === 'function',
        keys: Object.keys(downsampledPoints),
      });

      let resultLength = 0;
      if (typeof downsampledPoints.size === 'function') {
        resultLength = downsampledPoints.size();
      } else if (downsampledPoints.length) {
        resultLength = downsampledPoints.length;
      }

      console.log('Result length:', resultLength);

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
          console.error('Cannot access point at index', i);
          continue;
        }

        if (point && typeof point.x === 'number') {
          downsampledFloat32[i * 3] = point.x;
          downsampledFloat32[i * 3 + 1] = point.y;
          downsampledFloat32[i * 3 + 2] = point.z;
        } else {
          console.error('Invalid point at index', i, point);
        }
      }

      console.log(
        'Converted to Float32Array:',
        downsampledFloat32.length,
        'values'
      );

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
