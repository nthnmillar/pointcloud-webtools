import { BaseService } from '../BaseService';
import { ToolsService } from './ToolsService';
import type { ServiceManager } from '../ServiceManager';
import type {
  VoxelModule as VoxelModuleType,
} from '../../wasm/VoxelModule.d.ts';
import { VoxelDebug } from './VoxelDebug';
import type { VoxelDebugOptions } from './VoxelDebug';

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
  private _voxelDebug?: VoxelDebug;

  constructor(toolsService?: ToolsService, serviceManager?: ServiceManager) {
    super();
    this._toolsService = toolsService;
    this._serviceManager = serviceManager;
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


      // Debug: Log the parameters being passed to WASM
      console.log('WASM Input parameters:', {
        pointCount: params.pointCloudData.length / 3,
        voxelSize: params.voxelSize,
        globalBounds: params.globalBounds
      });

      // Ensure we have valid bounds values
      const minX = params.globalBounds?.minX ?? 0;
      const minY = params.globalBounds?.minY ?? 0;
      const minZ = params.globalBounds?.minZ ?? 0;

      // Validate bounds are finite numbers
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(minZ)) {
        console.error('Invalid bounds values:', { minX, minY, minZ });
        throw new Error('Invalid global bounds - non-finite values detected');
      }

      console.log('Using bounds:', { minX, minY, minZ });

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
      console.error('Scene not available for voxel debug initialization');
      return false;
    }

    this._voxelDebug = new VoxelDebug(this._serviceManager.sceneService.scene);
    return true;
  }

  // Voxel Debug Visualization
  showVoxelDebug(voxelSize: number): void {
    if (!this.initializeVoxelDebug()) {
      console.error('Failed to initialize VoxelDebug');
      return;
    }

    if (!this._serviceManager?.pointService) {
      console.error('Point service not available for voxel debug');
      return;
    }

    // Get all point clouds to calculate global bounds
    const allPointCloudIds = this._serviceManager.pointService.pointCloudIds;
    
    if (allPointCloudIds.length === 0) {
      console.error('No point clouds found for voxel debug');
      return;
    }

    let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
    let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

    for (const pointCloudId of allPointCloudIds) {
      const pointCloud = this._serviceManager.pointService.getPointCloud(pointCloudId);
      if (pointCloud && pointCloud.points) {
        for (const point of pointCloud.points) {
          globalMinX = Math.min(globalMinX, point.position.x);
          globalMinY = Math.min(globalMinY, point.position.y);
          globalMinZ = Math.min(globalMinZ, point.position.z);
          globalMaxX = Math.max(globalMaxX, point.position.x);
          globalMaxY = Math.max(globalMaxY, point.position.y);
          globalMaxZ = Math.max(globalMaxZ, point.position.z);
        }
      }
    }

    // Collect point cloud data for voxel debug
    const pointClouds = [];
    for (const pointCloudId of allPointCloudIds) {
      const pointCloud = this._serviceManager.pointService.getPointCloud(pointCloudId);
      if (pointCloud && pointCloud.points) {
        pointClouds.push(pointCloud);
      }
    }

    const debugOptions: VoxelDebugOptions = {
      voxelSize,
      globalBounds: {
        minX: globalMinX,
        minY: globalMinY,
        minZ: globalMinZ,
        maxX: globalMaxX,
        maxY: globalMaxY,
        maxZ: globalMaxZ
      },
      pointClouds
    };

    this._voxelDebug!.showVoxelDebug(debugOptions);
  }

  hideVoxelDebug(): void {
    if (this._voxelDebug) {
      this._voxelDebug.hideVoxelDebug();
    }
  }



  dispose(): void {
    this._isProcessing = false;
    this.hideVoxelDebug();
    if (this._voxelDebug) {
      this._voxelDebug.dispose();
    }
    this.removeAllObservers();
  }
}
