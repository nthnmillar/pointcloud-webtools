import { BaseService } from '../../BaseService';
import { ToolsService } from '../ToolsService';
import type { ServiceManager } from '../../ServiceManager';
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

export class VoxelDownsamplingTS extends BaseService {
  private _isProcessing: boolean = false;
  private _currentVoxelSize: number = 0.1;
  private _toolsService?: ToolsService;
  private _serviceManager?: ServiceManager;
  private _isCancelled: boolean = false;

  constructor(toolsService?: ToolsService, serviceManager?: ServiceManager) {
    super();
    this._toolsService = toolsService;
    this._serviceManager = serviceManager;
  }

  async initialize(): Promise<void> {
    try {
      Log.InfoClass(this, 'Initializing TypeScript Voxel Downsampling service...');
      this.isInitialized = true;
      Log.InfoClass(this, 'TypeScript Voxel Downsampling service initialized successfully');
    } catch (error) {
      Log.ErrorClass(this, 'Failed to initialize TypeScript Voxel Downsampling service', error);
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

  // TypeScript Voxel Downsampling
  async voxelDownsampleTypeScript(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    if (this._isProcessing) {
      throw new Error('Another processing operation is already in progress');
    }

    this._isProcessing = true;
    this.emit('processingStarted', {
      operation: 'voxelDownsampleTypeScript',
      params,
    });
    this._toolsService?.forwardEvent('processingStarted', {
      operation: 'voxelDownsampleTypeScript',
      params,
    });

    try {
      const startTime = performance.now();

      if (!params.pointCloudData) {
        throw new Error('No point cloud data provided');
      }

      // Calculate bounds if not provided
      let bounds = params.globalBounds;
      if (!bounds) {
        bounds = this.calculateBounds(params.pointCloudData);
      }

      // Create a map to store voxel centers
      const voxelMap = new Map<string, {
        count: number;
        sumX: number;
        sumY: number;
        sumZ: number;
      }>();
      
      // Process each point
      for (let i = 0; i < params.pointCloudData.length; i += 3) {
        const x = params.pointCloudData[i];
        const y = params.pointCloudData[i + 1];
        const z = params.pointCloudData[i + 2];
        
        // Calculate voxel coordinates
        const voxelX = Math.floor((x - bounds.minX) / params.voxelSize);
        const voxelY = Math.floor((y - bounds.minY) / params.voxelSize);
        const voxelZ = Math.floor((z - bounds.minZ) / params.voxelSize);
        
        // Create voxel key
        const voxelKey = `${voxelX},${voxelY},${voxelZ}`;
        
        // Add point to voxel
        if (voxelMap.has(voxelKey)) {
          const voxel = voxelMap.get(voxelKey)!;
          voxel.count++;
          voxel.sumX += x;
          voxel.sumY += y;
          voxel.sumZ += z;
        } else {
          voxelMap.set(voxelKey, {
            count: 1,
            sumX: x,
            sumY: y,
            sumZ: z
          });
        }
      }
      
      // Convert voxel centers back to points
      const downsampledPoints = new Float32Array(voxelMap.size * 3);
      let index = 0;
      
      for (const [_, voxel] of voxelMap) {
        // Calculate average position (voxel center)
        const avgX = voxel.sumX / voxel.count;
        const avgY = voxel.sumY / voxel.count;
        const avgZ = voxel.sumZ / voxel.count;
        
        downsampledPoints[index * 3] = avgX;
        downsampledPoints[index * 3 + 1] = avgY;
        downsampledPoints[index * 3 + 2] = avgZ;
        index++;
      }

      const processingTime = performance.now() - startTime;

      const result: VoxelDownsampleResult = {
        success: true,
        downsampledPoints,
        originalCount: params.pointCloudData.length / 3,
        downsampledCount: downsampledPoints.length / 3,
        processingTime,
      };

      this.emit('processingCompleted', {
        operation: 'voxelDownsampleTypeScript',
        result,
      });
      this._toolsService?.forwardEvent('processingCompleted', {
        operation: 'voxelDownsampleTypeScript',
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
        operation: 'voxelDownsampleTypeScript',
        error: errorResult.error,
      });
      this._toolsService?.forwardEvent('processingError', {
        operation: 'voxelDownsampleTypeScript',
        error: errorResult.error,
      });
      return errorResult;
    } finally {
      this._isProcessing = false;
      this.emit('processingFinished', { operation: 'voxelDownsampleTypeScript' });
      this._toolsService?.forwardEvent('processingFinished', {
        operation: 'voxelDownsampleTypeScript',
      });
    }
  }

  // Helper method to calculate bounds
  private calculateBounds(points: Float32Array): {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  } {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < points.length; i += 3) {
      const x = points[i];
      const y = points[i + 1];
      const z = points[i + 2];

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    return { minX, minY, minZ, maxX, maxY, maxZ };
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
    this.removeAllObservers();
    Log.InfoClass(this, 'TypeScript Voxel Downsampling service disposed');
  }
}
