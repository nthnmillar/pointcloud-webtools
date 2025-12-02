import { Log } from '../../../utils/Log';
import { BaseService } from '../../BaseService';

export interface PointCloudSmoothingBEPythonParams {
  pointCloudData: Float32Array;
  smoothingRadius: number;
  iterations: number;
}

export interface PointCloudSmoothingBEPythonResult {
  success: boolean;
  smoothedPoints: Float32Array;
  originalCount: number;
  smoothedCount: number;
  processingTime: number;
  smoothingRadius: number;
  iterations: number;
}

interface PointSmoothPythonResponseHeader {
  type: 'point_smooth_python_result';
  requestId: string;
  success: boolean;
  originalCount: number;
  smoothedCount: number;
  processingTime: number;
  smoothingRadius: number;
  iterations: number;
  dataLength: number;
  error?: string;
}

interface PendingRequest {
  resolve: (value: PointCloudSmoothingBEPythonResult) => void;
  reject: (reason?: Error) => void;
}

export class PointCloudSmoothingBEPython extends BaseService {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingHeader: PointSmoothPythonResponseHeader | null = null; // Track pending binary data header

  constructor() {
    super();
    this.connect();
  }

  async initialize(): Promise<void> {
    // WebSocket connection is handled in constructor
  }

  dispose(): void {
    this.destroy();
  }

  private connect(): void {
    try {
      Log.Info('PointCloudSmoothingBEPython', 'Connecting to WebSocket', {
        baseUrl: 'ws://localhost:3003',
      });

      this.ws = new WebSocket('ws://localhost:3003');

      this.ws.onopen = () => {
        Log.Info('PointCloudSmoothingBEPython', 'WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = async (event: MessageEvent) => {
        try {
          // Check if this is binary data or JSON header
          if (event.data instanceof ArrayBuffer) {
            // This is binary data
            if (
              this.pendingHeader &&
              this.pendingHeader.type === 'point_smooth_python_result' &&
              this.pendingHeader.success
            ) {
              // Create Float32Array directly from binary data (zero-copy!)
              const smoothedPoints = new Float32Array(
                event.data,
                0,
                this.pendingHeader.dataLength
              );

              const pending = this.pendingRequests.get(
                this.pendingHeader.requestId
              );
              if (pending) {
                this.pendingRequests.delete(this.pendingHeader.requestId);

                const result: PointCloudSmoothingBEPythonResult = {
                  success: true,
                  smoothedPoints: smoothedPoints,
                  originalCount: this.pendingHeader.originalCount,
                  smoothedCount: this.pendingHeader.smoothedCount,
                  processingTime: this.pendingHeader.processingTime,
                  smoothingRadius: this.pendingHeader.smoothingRadius,
                  iterations: this.pendingHeader.iterations,
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
              this.pendingHeader.type === 'point_smooth_python_result' &&
              this.pendingHeader.success
            ) {
              const smoothedPoints = new Float32Array(
                arrayBuffer,
                0,
                this.pendingHeader.dataLength
              );

              const pending = this.pendingRequests.get(
                this.pendingHeader.requestId
              );
              if (pending) {
                this.pendingRequests.delete(this.pendingHeader.requestId);

                const result: PointCloudSmoothingBEPythonResult = {
                  success: true,
                  smoothedPoints: smoothedPoints,
                  originalCount: this.pendingHeader.originalCount,
                  smoothedCount: this.pendingHeader.smoothedCount,
                  processingTime: this.pendingHeader.processingTime,
                  smoothingRadius: this.pendingHeader.smoothingRadius,
                  iterations: this.pendingHeader.iterations,
                };
                pending.resolve(result);
              }
              this.pendingHeader = null;
            }
          } else {
            // This is JSON header
            const message = JSON.parse(event.data as string);

            if (message.type === 'point_smooth_python_result') {
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
                    new Error(
                      error || 'Python BE WebSocket smoothing processing failed'
                    )
                  );
                }
              }
            }
          }
        } catch (error) {
          Log.Error(
            'PointCloudSmoothingBEPython',
            'Error parsing WebSocket message',
            error
          );
        }
      };

      this.ws.onclose = () => {
        Log.Info('PointCloudSmoothingBEPython', 'WebSocket disconnected');
        this.ws = null;

        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Log.Info(
            'PointCloudSmoothingBEPython',
            `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
          );
          setTimeout(
            () => this.connect(),
            this.reconnectDelay * this.reconnectAttempts
          );
        }
      };

      this.ws.onerror = (error: Event) => {
        Log.Error('PointCloudSmoothingBEPython', 'WebSocket error', error);
      };
    } catch (error) {
      Log.Error(
        'PointCloudSmoothingBEPython',
        'Failed to connect WebSocket',
        error
      );
    }
  }

  async pointCloudSmooth(
    params: PointCloudSmoothingBEPythonParams
  ): Promise<PointCloudSmoothingBEPythonResult> {
    Log.Info(
      'PointCloudSmoothingBEPython',
      'Starting point cloud smoothing via WebSocket',
      {
        pointCount: params.pointCloudData.length / 3,
        smoothingRadius: params.smoothingRadius,
        iterations: params.iterations,
      }
    );

    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        Log.Error('PointCloudSmoothingBEPython', 'WebSocket not connected', {
          wsExists: !!this.ws,
          readyState: this.ws?.readyState,
          expectedState: WebSocket.OPEN,
        });
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = `smooth_python_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store the promise resolvers
      this.pendingRequests.set(requestId, { resolve, reject });

      // Send binary data directly - no JSON serialization of points!
      const header = {
        type: 'point_smooth_python',
        requestId,
        smoothingRadius: params.smoothingRadius,
        iterations: params.iterations,
        dataLength: params.pointCloudData.length,
      };

      // Send header as JSON (small)
      this.ws.send(JSON.stringify(header));

      // Send binary data directly (fast)
      this.ws.send(params.pointCloudData.buffer);

      // Set a timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Python BE WebSocket smoothing timeout'));
        }
      }, 30000); // 30 second timeout
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
