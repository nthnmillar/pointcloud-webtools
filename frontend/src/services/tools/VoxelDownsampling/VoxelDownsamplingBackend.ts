import { BaseService } from '../../BaseService';
import { ToolsService } from '../ToolsService';
import { Log } from '../../../utils/Log';

export interface VoxelDownsampleBackendParams {
  voxelSize: number;
  pointCloudData: Float32Array;
  globalBounds?: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  };
}

export interface VoxelDownsampleBackendResult {
  success: boolean;
  downsampledPoints?: Float32Array;
  originalCount: number;
  downsampledCount: number;
  processingTime: number;
  method: string;
  error?: string;
}

export class VoxelDownsamplingBackend extends BaseService {
  private _isProcessing: boolean = false;
  private _isCancelled: boolean = false;
  private _toolsService: ToolsService | null = null;
  private _currentVoxelSize: number = 0.1;
  private _backendUrl: string;

  constructor(toolsService: ToolsService, backendUrl: string = 'http://localhost:3001') {
    super();
    this._toolsService = toolsService;
    this._backendUrl = backendUrl;
  }

  /**
   * Get current voxel size
   */
  get currentVoxelSize(): number {
    return this._currentVoxelSize;
  }

  /**
   * Set voxel size
   */
  setVoxelSize(size: number): void {
    this._currentVoxelSize = size;
    this.emit('voxelSizeChanged', { voxelSize: size });
  }

  /**
   * Check if processing is in progress
   */
  get isProcessing(): boolean {
    return this._isProcessing;
  }

  /**
   * Cancel current processing
   */
  cancelProcessing(): void {
    this._isCancelled = true;
    this.emit('processingCancelled');
  }

  /**
   * Reset processing state
   */
  resetProcessingState(): void {
    this._isProcessing = false;
    this._isCancelled = false;
  }

  /**
   * Check if backend server is available
   */
  async checkBackendHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this._backendUrl}/api/health`);
      return response.ok;
    } catch (error) {
      Log.Error('VoxelDownsamplingBackend', 'Backend health check failed', error);
      return false;
    }
  }

  /**
   * Backend Voxel Downsampling Implementation
   * Sends data to backend server for processing
   */
  async voxelDownsampleBackend(
    params: VoxelDownsampleBackendParams
  ): Promise<VoxelDownsampleBackendResult> {
    if (this._isProcessing) {
      throw new Error('Another processing operation is already in progress');
    }

    this._isProcessing = true;
    this._isCancelled = false;
    this.emit('processingStarted', {
      operation: 'voxelDownsampleBackend',
      params,
    });

    try {
      const startTime = performance.now();

      // Check for cancellation before starting
      if (this._isCancelled) {
        throw new Error('Processing was cancelled');
      }

      if (!params.pointCloudData || params.pointCloudData.length === 0) {
        throw new Error('No point cloud data provided');
      }

      // Check if backend is available
      const isBackendAvailable = await this.checkBackendHealth();
      if (!isBackendAvailable) {
        throw new Error('Backend server is not available. Please start the backend server.');
      }

      Log.Info('VoxelDownsamplingBackend', 'Starting backend voxel downsampling', {
        pointCount: params.pointCloudData.length / 3,
        voxelSize: params.voxelSize,
        backendUrl: this._backendUrl,
      });

      // Prepare data for backend
      const pointsArray = Array.from(params.pointCloudData);
      const requestData = {
        points: pointsArray,
        voxelSize: params.voxelSize,
        globalBounds: params.globalBounds,
      };

      // Send request to backend
      const response = await fetch(`${this._backendUrl}/api/voxel-downsample`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Backend error: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Backend processing failed');
      }

      const totalTime = performance.now() - startTime;

      Log.Info('VoxelDownsamplingBackend', 'Backend voxel downsampling completed', {
        originalCount: result.originalCount,
        downsampledCount: result.downsampledCount,
        reduction: ((result.originalCount - result.downsampledCount) / result.originalCount * 100).toFixed(2) + '%',
        backendProcessingTime: result.processingTime + 'ms',
        totalTime: totalTime.toFixed(2) + 'ms',
        method: result.method,
      });

      const backendResult: VoxelDownsampleBackendResult = {
        success: true,
        downsampledPoints: new Float32Array(result.downsampledPoints),
        originalCount: result.originalCount,
        downsampledCount: result.downsampledCount,
        processingTime: result.processingTime,
        method: result.method,
      };

      this.emit('processingFinished', backendResult);
      return backendResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Log.Error('VoxelDownsamplingBackend', 'Backend voxel downsampling failed', { error: errorMessage });

      const result: VoxelDownsampleBackendResult = {
        success: false,
        originalCount: params.pointCloudData.length / 3,
        downsampledCount: 0,
        processingTime: 0,
        method: 'Backend Node.js',
        error: errorMessage,
      };

      this.emit('processingError', result);
      return result;
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Dispose of the service
   */
  dispose(): void {
    this.resetProcessingState();
    this.removeAllObservers();
  }
}
