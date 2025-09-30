import { BaseService } from '../../BaseService';
import { ToolsService } from '../ToolsService';
import type { ServiceManager } from '../../ServiceManager';
import type {
  VoxelModule as VoxelModuleType,
} from '../../../wasm/VoxelModule.d.ts';
import { VoxelDownsampleDebug } from './VoxelDownsampleDebug';
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

export class VoxelDownsamplingWASM extends BaseService {
  private _isProcessing: boolean = false;
  private _currentVoxelSize: number = 0.1;
  private _toolsService?: ToolsService;
  private _serviceManager?: ServiceManager;
  private _voxelModule?: VoxelModuleType;
  private _voxelDebug?: VoxelDownsampleDebug;
  private _isCancelled: boolean = false;

  constructor(toolsService?: ToolsService, serviceManager?: ServiceManager) {
    super();
    this._toolsService = toolsService;
    this._serviceManager = serviceManager;
  }

  async initialize(): Promise<void> {
    try {
      Log.InfoClass(this, 'Initializing WASM Voxel Downsampling service...');

      // Load WASM module using fetch and eval (same as original)
      const response = await fetch('/wasm/voxel_downsampling.js');
      const jsCode = await response.text();

      // Create a module function
      const moduleFunction = new Function('module', 'exports', jsCode);

      // Create module object
      const module = { exports: {} };
      moduleFunction(module, module.exports);

      // Get the default export or the module itself
      this._voxelModule = (module.exports as any).default || module.exports;

      Log.InfoClass(this, 'WASM Voxel Downsampling service initialized successfully');
      this.isInitialized = true;
    } catch (error) {
      Log.ErrorClass(this, 'Failed to initialize WASM Voxel Downsampling service', error);
      throw error;
    }
  }

  get isProcessing(): boolean {
    return this._isProcessing;
  }

  get currentVoxelSize(): number {
    return this._currentVoxelSize;
  }

  set currentVoxelSize(value: number) {
    this._currentVoxelSize = value;
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
      this.emit('processingFinished', { operation: 'voxelDownsampleWasm' });
      this._toolsService?.forwardEvent('processingFinished', {
        operation: 'voxelDownsampleWasm',
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
      Log.ErrorClass(this, 'Failed to initialize voxel debug');
      return;
    }

    // Get actual point cloud data for debug visualization
    const pointClouds = [];
    let globalBounds = {
      minX: -100, minY: -100, minZ: -100,
      maxX: 100, maxY: 100, maxZ: 100
    };

    if (this._serviceManager?.pointService) {
      const pointCloudIds = this._serviceManager.pointService.pointCloudIds;
      for (const id of pointCloudIds) {
        const pointCloud = this._serviceManager.pointService.getPointCloud(id);
        if (pointCloud) {
          pointClouds.push(pointCloud);
        }
      }

      // Calculate actual bounds from point clouds
      if (pointClouds.length > 0) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const pointCloud of pointClouds) {
          if (pointCloud.points) {
            for (const point of pointCloud.points) {
              minX = Math.min(minX, point.position.x);
              minY = Math.min(minY, point.position.y);
              minZ = Math.min(minZ, point.position.z);
              maxX = Math.max(maxX, point.position.x);
              maxY = Math.max(maxY, point.position.y);
              maxZ = Math.max(maxZ, point.position.z);
            }
          }
        }

        if (isFinite(minX)) {
          globalBounds = { minX, minY, minZ, maxX, maxY, maxZ };
        }
      }
    }

    this._voxelDebug?.showVoxelDebug({
      voxelSize,
      globalBounds,
      pointClouds
    });
    Log.InfoClass(this, 'Voxel debug grid shown', { voxelSize, pointCloudCount: pointClouds.length });
  }

  hideVoxelDebug(): void {
    if (this._voxelDebug) {
      this._voxelDebug.hideVoxelDebug();
      Log.InfoClass(this, 'Voxel debug grid hidden');
    }
  }

  // Cancel processing
  cancelProcessing(): void {
    if (this._isProcessing) {
      this._isCancelled = true;
      Log.InfoClass(this, 'Processing cancellation requested');
    }
  }

  // Reset processing state
  resetProcessingState(): void {
    this._isProcessing = false;
    this._isCancelled = false;
    Log.InfoClass(this, 'Processing state reset');
  }

  dispose(): void {
    this._voxelDebug?.dispose();
    this.removeAllObservers();
    Log.InfoClass(this, 'WASM Voxel Downsampling service disposed');
  }
}
