import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';
import { BACKEND_WS_URL } from '../../../config';

export interface VoxelDebugParams {
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

export interface VoxelDebugResult {
  success: boolean;
  voxelCenters?: Float32Array;
  voxelCount?: number;
  processingTime?: number;
  error?: string;
}

interface VoxelDebugResponseHeader {
  type: 'voxel_debug_cpp_result';
  requestId: string;
  success: boolean;
  voxelCount: number;
  processingTime: number;
  dataLength: number;
  error?: string;
}

export class VoxelDownsampleDebugBECPP extends BaseService {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: VoxelDebugResult) => void;
      reject: (reason?: unknown) => void;
      timeoutId?: NodeJS.Timeout;
    }
  >();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingHeader: VoxelDebugResponseHeader | null = null; // Track pending binary data header

  constructor(_serviceManager: ServiceManager) {
    super();
    this.connect();
  }

  async initialize(): Promise<void> {
    // WebSocket connection is handled in constructor
    this.isInitialized = true;
  }

  dispose(): void {
    this.destroy();
  }

  private connect(): void {
    try {
      Log.Info('VoxelDownsampleDebugBECPP', 'Connecting to WebSocket', {
        baseUrl: BACKEND_WS_URL,
      });

      this.ws = new WebSocket(BACKEND_WS_URL);

      this.ws.onopen = () => {
        Log.Info('VoxelDownsampleDebugBECPP', 'WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = async event => {
        try {
          // Check if this is binary data or JSON header
          if (event.data instanceof ArrayBuffer) {
            // This is binary data
            if (
              this.pendingHeader &&
              this.pendingHeader.type === 'voxel_debug_cpp_result' &&
              this.pendingHeader.success
            ) {
              // Create Float32Array directly from binary data (zero-copy!)
              const voxelCenters = new Float32Array(
                event.data,
                0,
                this.pendingHeader.dataLength
              );

              const pending = this.pendingRequests.get(
                this.pendingHeader.requestId
              );
              if (pending) {
                if (pending.timeoutId) {
                  clearTimeout(pending.timeoutId);
                }
                this.pendingRequests.delete(this.pendingHeader.requestId);

                const result: VoxelDebugResult = {
                  success: true,
                  voxelCenters: voxelCenters,
                  voxelCount: this.pendingHeader.voxelCount,
                  processingTime: this.pendingHeader.processingTime,
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
              this.pendingHeader.type === 'voxel_debug_cpp_result' &&
              this.pendingHeader.success
            ) {
              const voxelCenters = new Float32Array(
                arrayBuffer,
                0,
                this.pendingHeader.dataLength
              );

              const pending = this.pendingRequests.get(
                this.pendingHeader.requestId
              );
              if (pending) {
                if (pending.timeoutId) {
                  clearTimeout(pending.timeoutId);
                }
                this.pendingRequests.delete(this.pendingHeader.requestId);

                const result: VoxelDebugResult = {
                  success: true,
                  voxelCenters: voxelCenters,
                  voxelCount: this.pendingHeader.voxelCount,
                  processingTime: this.pendingHeader.processingTime,
                };
                pending.resolve(result);
              }
              this.pendingHeader = null;
            }
          } else {
            // This is JSON header
            const message = JSON.parse(event.data as string);

            if (message.type === 'voxel_debug_cpp_result') {
              if (message.success && message.dataLength) {
                // Store header and wait for binary data
                this.pendingHeader = message;
              } else {
                // Error response (no binary data)
                const { requestId, error } = message;
                const pending = this.pendingRequests.get(requestId);
                if (pending) {
                  if (pending.timeoutId) {
                    clearTimeout(pending.timeoutId);
                  }
                  this.pendingRequests.delete(requestId);
                  pending.reject(
                    new Error(
                      error || 'C++ BE WebSocket debug processing failed'
                    )
                  );
                }
              }
            }
          }
        } catch (error) {
          Log.Error(
            'VoxelDownsampleDebugBECPP',
            'Error parsing WebSocket message',
            error
          );
        }
      };

      this.ws.onclose = () => {
        Log.Info('VoxelDownsampleDebugBECPP', 'WebSocket disconnected');
        this.ws = null;

        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Log.Info(
            'VoxelDownsampleDebugBECPP',
            `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
          );
          setTimeout(
            () => this.connect(),
            this.reconnectDelay * this.reconnectAttempts
          );
        }
      };

      this.ws.onerror = error => {
        Log.Error('VoxelDownsampleDebugBECPP', 'WebSocket error', error);
      };
    } catch (error) {
      Log.Error(
        'VoxelDownsampleDebugBECPP',
        'Failed to connect WebSocket',
        error
      );
    }
  }

  async generateVoxelCenters(
    params: VoxelDebugParams
  ): Promise<VoxelDebugResult> {
    Log.Info(
      'VoxelDownsampleDebugBECPP',
      'Starting voxel debug generation via WebSocket',
      {
        pointCount: params.pointCloudData.length / 3,
        voxelSize: params.voxelSize,
      }
    );

    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        Log.Error('VoxelDownsampleDebugBECPP', 'WebSocket not connected', {
          wsExists: !!this.ws,
          readyState: this.ws?.readyState,
          expectedState: WebSocket.OPEN,
        });
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = `debug_cpp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Calculate timeout based on point count - debug operations may take longer for large point clouds
      const pointCount = params.pointCloudData.length / 3;
      const timeoutMs = pointCount > 500000 ? 120000 : 60000; // 2 minutes for large clouds, 1 minute for smaller

      // Set timeout before storing request
      const timeoutId = setTimeout(() => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          pending.reject(
            new Error(
              `C++ BE WebSocket debug timeout after ${timeoutMs / 1000}s (${pointCount.toLocaleString()} points)`
            )
          );
        }
      }, timeoutMs);

      // Store the promise resolvers with timeout ID
      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

      // Send binary data directly - no JSON serialization of points!
      const header = {
        type: 'voxel_debug_cpp',
        requestId,
        voxelSize: params.voxelSize,
        globalBounds: params.globalBounds,
        dataLength: params.pointCloudData.length,
      };

      // Send header as JSON (small)
      this.ws.send(JSON.stringify(header));

      // Send binary data directly (fast)
      this.ws.send(params.pointCloudData.buffer);
    });
  }

  destroy(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.clear();
  }
}
