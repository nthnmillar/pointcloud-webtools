import { Log } from '../../../utils/Log';
import { BaseService } from '../../BaseService';

export interface PointCloudSmoothingBERustParams {
  pointCloudData: Float32Array;
  smoothingRadius: number;
  iterations: number;
}

export interface PointCloudSmoothingBERustResult {
  success: boolean;
  smoothedPoints: Float32Array;
  originalCount: number;
  smoothedCount: number;
  processingTime: number;
  smoothingRadius: number;
  iterations: number;
}

export class PointCloudSmoothingBERust extends BaseService {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, { resolve: (value: PointCloudSmoothingBERustResult) => void; reject: (reason?: any) => void }>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(baseUrl: string = 'ws://localhost:3003') {
    super();
    this.connect();
  }

  private connect(): void {
    try {
      Log.Info('PointCloudSmoothingBERust', 'Connecting to WebSocket', { baseUrl: 'ws://localhost:3003' });
      
      this.ws = new WebSocket('ws://localhost:3003');
      
      this.ws.onopen = () => {
        Log.Info('PointCloudSmoothingBERust', 'WebSocket connected');
        this.reconnectAttempts = 0;
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'point_smooth_rust_result') {
            const { requestId, success, error, data } = message;
            
            if (this.pendingRequests.has(requestId)) {
              const { resolve, reject } = this.pendingRequests.get(requestId)!;
              this.pendingRequests.delete(requestId);
              
              if (success) {
                const result: PointCloudSmoothingBERustResult = {
                  success: true,
                  smoothedPoints: new Float32Array(data.smoothedPoints),
                  originalCount: data.originalCount,
                  smoothedCount: data.smoothedCount,
                  processingTime: data.processingTime,
                  smoothingRadius: data.smoothingRadius,
                  iterations: data.iterations
                };
                resolve(result);
              } else {
                reject(new Error(error || 'Rust BE WebSocket smoothing failed'));
              }
            }
          }
        } catch (error) {
          Log.Error('PointCloudSmoothingBERust', 'Error parsing WebSocket message', error);
        }
      };
      
      this.ws.onclose = () => {
        Log.Info('PointCloudSmoothingBERust', 'WebSocket disconnected');
        this.ws = null;
        
        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Log.Info('PointCloudSmoothingBERust', `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
        }
      };
      
      this.ws.onerror = (error) => {
        Log.Error('PointCloudSmoothingBERust', 'WebSocket error', error);
      };
      
    } catch (error) {
      Log.Error('PointCloudSmoothingBERust', 'Failed to connect WebSocket', error);
    }
  }

  async pointCloudSmooth(params: PointCloudSmoothingBERustParams): Promise<PointCloudSmoothingBERustResult> {
    Log.Info('PointCloudSmoothingBERust', 'Starting point cloud smoothing via WebSocket', {
      pointCount: params.pointCloudData.length / 3,
      smoothingRadius: params.smoothingRadius,
      iterations: params.iterations
    });
    
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        Log.Error('PointCloudSmoothingBERust', 'WebSocket not connected', {
          wsExists: !!this.ws,
          readyState: this.ws?.readyState
        });
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = `smooth_rust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the promise resolvers
      this.pendingRequests.set(requestId, { resolve, reject });

      // Send binary data directly - no JSON serialization of points!
      const header = {
        type: 'point_smooth_rust',
        requestId,
        smoothingRadius: params.smoothingRadius,
        iterations: params.iterations,
        dataLength: params.pointCloudData.length
      };

      // Send header as JSON (small)
      this.ws.send(JSON.stringify(header));
      
      // Send binary data directly (fast)
      this.ws.send(params.pointCloudData.buffer);

      // Set a timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Rust BE WebSocket smoothing timeout'));
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
