import { BaseService } from '../../BaseService';
import { ToolsService } from '../ToolsService';
import type { ServiceManager } from '../../ServiceManager';
import type {
  VoxelModule as VoxelModuleType,
} from '../../../wasm/VoxelModule.d.ts';
import { VoxelDownsampleDebug } from './VoxelDownsampleDebug';
import { VoxelDownsampleService } from './VoxelDownsampleService';
import { Log } from '../../../utils/Log';

export interface VoxelDownsampleParams {
  voxelSize: number;
  pointCloudData?: Float32Array;
  globalBounds?: {
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
  error?: string;
}

export class VoxelDownsampling extends BaseService {
  private _isProcessing: boolean = false;
  private _currentVoxelSize: number = 0.1;
  private _toolsService?: ToolsService;
  private _serviceManager?: ServiceManager;
  private _voxelModule?: VoxelModuleType;
  private _voxelDebug?: VoxelDownsampleDebug;
  private _workerService: VoxelDownsampleService;
  private _isCancelled: boolean = false;

  constructor(toolsService?: ToolsService, serviceManager?: ServiceManager) {
    super();
    this._toolsService = toolsService;
    this._serviceManager = serviceManager;
    this._workerService = new VoxelDownsampleService();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize the direct WASM module first (required)
      await this.initializeDirectWasm();
      Log.InfoClass(this, 'Direct WASM module initialized successfully');
      
      // Try to initialize the worker (optional)
      try {
        await this._workerService.initialize();
        Log.InfoClass(this, 'Worker service initialized successfully');
      } catch (workerError) {
        Log.WarnClass(this, 'Worker service failed to initialize, continuing without worker', workerError);
        // Continue without worker - the direct WASM implementation will be used
      }
      
      this.isInitialized = true;
    } catch (error) {
      Log.ErrorClass(this, 'Failed to initialize', error);
      throw error;
    }
  }

  private async initializeDirectWasm(): Promise<void> {
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

    Log.InfoClass(this, 'Direct WASM module loaded successfully');
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
    if (size < 0.01 || size > 2.0) {
      throw new Error('Voxel size must be between 0.01 and 2.0 meters');
    }
    this._currentVoxelSize = size;
    this.emit('voxelSizeChanged', { voxelSize: size });
    this._toolsService?.forwardEvent('voxelSizeChanged', { voxelSize: size });
  }

  // Cancel processing
  cancelProcessing(): void {
    if (this._isProcessing) {
      this._isCancelled = true;
      Log.InfoClass(this, 'Processing cancellation requested');
      this.emit('processingCancelled', { operation: 'voxelDownsampling' });
      this._toolsService?.forwardEvent('processingCancelled', { operation: 'voxelDownsampling' });
    }
  }

  // Reset processing state (called when all batches are complete)
  resetProcessingState(): void {
    if (this._isProcessing) {
      this._isProcessing = false;
      this._isCancelled = false;
      this.emit('processingFinished', { operation: 'voxelDownsampling' });
      this._toolsService?.forwardEvent('processingFinished', { operation: 'voxelDownsampling' });
    }
  }

  // Worker-based batch processing
  async voxelDownsampleBatchWasm(batchData: {
    batchId: string;
    points: Float32Array;
    voxelSize: number;
    globalBounds: {
      minX: number;
      minY: number;
      minZ: number;
      maxX: number;
      maxY: number;
      maxZ: number;
    };
  }): Promise<VoxelDownsampleResult> {
    // Check for cancellation before processing
    if (this._isCancelled) {
      return {
        success: false,
        error: 'Processing was cancelled',
        downsampledPoints: new Float32Array(0),
        originalCount: 0,
        downsampledCount: 0,
        processingTime: 0
      };
    }

    // Set processing state for batch processing
    if (!this._isProcessing) {
      this._isProcessing = true;
      this.emit('processingStarted', {
        operation: 'voxelDownsampleBatchWasm',
        batchId: batchData.batchId,
      });
      this._toolsService?.forwardEvent('processingStarted', {
        operation: 'voxelDownsampleBatchWasm',
        batchId: batchData.batchId,
      });
    }

    // If worker is not ready, fall back to direct WASM processing
    if (!this._workerService.ready) {
      Log.WarnClass(this, 'Worker not ready, falling back to direct WASM processing');
      // Temporarily reset processing flag for fallback to avoid conflict
      const wasProcessing = this._isProcessing;
      this._isProcessing = false;
      const result = await this.voxelDownsampleWasm({
        pointCloudData: batchData.points,
        voxelSize: batchData.voxelSize,
        globalBounds: batchData.globalBounds
      });
      this._isProcessing = wasProcessing; // Restore original state
      return result;
    }

    try {
      const result = await this._workerService.processBatch(batchData);
      
      return {
        success: result.success,
        downsampledPoints: result.downsampledPoints,
        originalCount: result.originalCount,
        downsampledCount: result.downsampledCount,
        processingTime: result.processingTime,
        error: result.error
      };
    } catch (error) {
      Log.WarnClass(this, 'Worker processing failed, falling back to direct WASM', error);
      // Temporarily reset processing flag for fallback to avoid conflict
      const wasProcessing = this._isProcessing;
      this._isProcessing = false;
      const result = await this.voxelDownsampleWasm({
        pointCloudData: batchData.points,
        voxelSize: batchData.voxelSize,
        globalBounds: batchData.globalBounds
      });
      this._isProcessing = wasProcessing; // Restore original state
      return result;
    }
  }

  // WASM Voxel Downsampling
  async voxelDownsampleWasm(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    if (this._isProcessing) {
      throw new Error('Another processing operation is already in progress');
    }

    this._isProcessing = true;
    this._isCancelled = false; // Reset cancellation flag
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

      // Check for cancellation before starting
      if (this._isCancelled) {
        throw new Error('Processing was cancelled');
      }

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



      // Ensure we have valid bounds values
      const minX = params.globalBounds?.minX ?? 0;
      const minY = params.globalBounds?.minY ?? 0;
      const minZ = params.globalBounds?.minZ ?? 0;

      // Validate bounds are finite numbers
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(minZ)) {
        Log.ErrorClass(this, 'Invalid bounds values', { minX, minY, minZ });
        throw new Error('Invalid global bounds - non-finite values detected');
      }

      // Pass Float32Array directly like LAZ loader does
      // C++ function only needs min bounds, not max bounds
      const downsampledPoints = this._voxelModule.voxelDownsample(
        params.pointCloudData,
        params.voxelSize,
        minX,
        minY,
        minZ
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
      this._isCancelled = false; // Reset cancellation flag
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

  // Initialize VoxelDebug if not already initialized
  private initializeVoxelDebug(): boolean {
    if (this._voxelDebug) {
      return true;
    }

    if (!this._serviceManager?.sceneService?.scene) {
      Log.ErrorClass(this, 'Scene not available for voxel debug initialization');
      return false;
    }

    this._voxelDebug = new VoxelDownsampleDebug(this._serviceManager.sceneService.scene, this._serviceManager);
    return true;
  }

  // Voxel Debug Visualization
  showVoxelDebug(voxelSize: number): void {
    if (!this.initializeVoxelDebug()) {
      Log.ErrorClass(this, 'Failed to initialize VoxelDebug');
      return;
    }

    // Let the debug class handle everything internally
    this._voxelDebug!.showVoxelDebugWithSize(voxelSize);
  }

  hideVoxelDebug(): void {
    if (this._voxelDebug) {
      this._voxelDebug.hideVoxelDebug();
    }
  }

  updateVoxelDebug(voxelSize: number): void {
    if (!this._voxelDebug) {
      Log.WarnClass(this, 'VoxelDebug not initialized, cannot update');
      return;
    }

    // Let the debug class handle the update directly with stored data
    this._voxelDebug.updateVoxelSize(voxelSize);
  }



  dispose(): void {
    this._isProcessing = false;
    this.hideVoxelDebug();
    if (this._voxelDebug) {
      this._voxelDebug.dispose();
    }
    if (this._workerService) {
      this._workerService.dispose();
    }
    this.removeAllObservers();
  }
}
