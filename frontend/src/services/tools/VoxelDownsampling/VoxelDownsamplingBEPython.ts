import { Log } from '../../../utils/Log';
import { BaseService } from '../../BaseService';

export interface VoxelDownsamplingBEPythonParams {
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

export interface VoxelDownsamplingBEPythonResult {
  success: boolean;
  downsampledPoints: Float32Array;
  originalCount: number;
  downsampledCount: number;
  processingTime: number;
  voxelSize: number;
  voxelCount: number;
}

interface VoxelDownsamplePythonResponseHeader {
  type: 'voxel_downsample_python_result';
  requestId: string;
  success: boolean;
  originalCount: number;
  downsampledCount: number;
  voxelCount: number;
  processingTime: number;
  dataLength: number;
  voxelSize?: number;
  error?: string;
}

export class VoxelDownsamplingBEPython extends BaseService {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: VoxelDownsamplingBEPythonResult) => void;
      reject: (reason?: unknown) => void;
    }
  >();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingHeader: VoxelDownsamplePythonResponseHeader | null = null; // Track pending binary data header

  constructor() {
    super();
    this.connect();
  }

  public initialize(): void {
    // Initialize if needed
  }

  public dispose(): void {
    this.destroy();
  }

  private connect(): void {
    try {
      Log.Info('VoxelDownsamplingBEPython', 'Connecting to WebSocket', {
        baseUrl: 'ws://localhost:3003',
      });

      this.ws = new WebSocket('ws://localhost:3003');

      this.ws.onopen = () => {
        Log.Info('VoxelDownsamplingBEPython', 'WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = async event => {
        try {
          // Check if this is binary data or JSON header
          if (event.data instanceof ArrayBuffer) {
            // This is binary data
            if (
              this.pendingHeader &&
              this.pendingHeader.type === 'voxel_downsample_python_result' &&
              this.pendingHeader.success
            ) {
              // Create Float32Array directly from binary data (zero-copy!)
              const downsampledPoints = new Float32Array(
                event.data,
                0,
                this.pendingHeader.dataLength
              );

              const pending = this.pendingRequests.get(
                this.pendingHeader.requestId
              );
              if (pending) {
                this.pendingRequests.delete(this.pendingHeader.requestId);

                const result: VoxelDownsamplingBEPythonResult = {
                  success: true,
                  downsampledPoints: downsampledPoints,
                  originalCount: this.pendingHeader.originalCount,
                  downsampledCount: this.pendingHeader.downsampledCount,
                  processingTime: this.pendingHeader.processingTime,
                  voxelSize: this.pendingHeader.voxelSize,
                  voxelCount: this.pendingHeader.voxelCount,
                };
                pending.resolve(result);
              }
              this.pendingHeader = null;
            }
          } else if (event.data instanceof Blob) {
            // Convert Blob to ArrayBuffer
            const arrayBuffer = await event.data.arrayBuffer();
            if (
              this.pendingHeader &&
              this.pendingHeader.type === 'voxel_downsample_python_result' &&
              this.pendingHeader.success
            ) {
              const downsampledPoints = new Float32Array(
                arrayBuffer,
                0,
                this.pendingHeader.dataLength
              );

              const pending = this.pendingRequests.get(
                this.pendingHeader.requestId
              );
              if (pending) {
                this.pendingRequests.delete(this.pendingHeader.requestId);

                const result: VoxelDownsamplingBEPythonResult = {
                  success: true,
                  downsampledPoints: downsampledPoints,
                  originalCount: this.pendingHeader.originalCount,
                  downsampledCount: this.pendingHeader.downsampledCount,
                  processingTime: this.pendingHeader.processingTime,
                  voxelSize: this.pendingHeader.voxelSize,
                  voxelCount: this.pendingHeader.voxelCount,
                };
                pending.resolve(result);
              }
              this.pendingHeader = null;
            }
          } else {
            // This is JSON header
            const message = JSON.parse(event.data as string);

            if (message.type === 'voxel_downsample_python_result') {
              if (message.success && message.dataLength) {
                // Store header and wait for binary data
                this.pendingHeader = message;
              } else {
                // Error response (no binary data)
                const { requestId, error } = message;
                const pending = this.pendingRequests.get(requestId);
                if (pending) {
                  this.pendingRequests.delete(requestId);
                  pending.reject(
                    new Error(error || 'Voxel downsampling failed')
                  );
                }
              }
            }
          }
        } catch (error) {
          Log.Error(
            'VoxelDownsamplingBEPython',
            'Error parsing WebSocket message',
            error
          );
        }
      };

      this.ws.onclose = () => {
        Log.Info('VoxelDownsamplingBEPython', 'WebSocket disconnected');
        this.ws = null;

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Log.Info(
            'VoxelDownsamplingBEPython',
            `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
          );
          setTimeout(() => this.connect(), this.reconnectDelay);
        }
      };

      this.ws.onerror = error => {
        Log.Error('VoxelDownsamplingBEPython', 'WebSocket error', error);
      };
    } catch (error) {
      Log.Error(
        'VoxelDownsamplingBEPython',
        'Failed to connect WebSocket',
        error
      );
    }
  }

  public async performVoxelDownsampling(
    params: VoxelDownsamplingBEPythonParams
  ): Promise<VoxelDownsamplingBEPythonResult> {
    Log.Info(
      'VoxelDownsamplingBEPython',
      'Starting voxel downsampling via WebSocket',
      {
        pointCount: params.pointCloudData.length / 3,
        voxelSize: params.voxelSize,
      }
    );

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = `voxel_downsample_python_${Date.now()}_${Math.random()}`;

      this.pendingRequests.set(requestId, { resolve, reject });

      // Send header as JSON (small)
      const header = {
        type: 'voxel_downsample_python',
        requestId,
        voxelSize: params.voxelSize,
        globalBounds: params.globalBounds,
        dataLength: params.pointCloudData.length,
      };

      this.ws!.send(JSON.stringify(header));

      // Send binary data directly (fast)
      this.ws!.send(params.pointCloudData.buffer);
    });
  }

  private destroy(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.clear();
  }
}
