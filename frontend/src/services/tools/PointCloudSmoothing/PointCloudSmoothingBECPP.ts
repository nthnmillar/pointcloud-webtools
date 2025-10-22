import { Log } from '../../../utils/Log';
import { BaseService } from '../../BaseService';

export interface PointCloudSmoothingBECPPParams {
  pointCloudData: Float32Array;
  smoothingRadius: number;
  iterations: number;
}

export interface PointCloudSmoothingBECPPResult {
  success: boolean;
  smoothedPoints: Float32Array;
  originalCount: number;
  smoothedCount: number;
  processingTime: number;
  smoothingRadius: number;
  iterations: number;
}

export class PointCloudSmoothingBECPP extends BaseService {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, { resolve: (value: PointCloudSmoothingBECPPResult) => void; reject: (reason?: any) => void }>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

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
      Log.Info('PointCloudSmoothingBECPP', 'Connecting to WebSocket', { baseUrl: 'ws://localhost:3003' });
      
      this.ws = new WebSocket('ws://localhost:3003');
      
      this.ws.onopen = () => {
        Log.Info('PointCloudSmoothingBECPP', 'WebSocket connected');
        this.reconnectAttempts = 0;
        
        // Send a test message to verify connection
        this.ws.send(JSON.stringify({ type: 'test', message: 'Hello from C++ BE frontend' }));
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'point_smooth_cpp_result') {
            const { requestId, success, error, data } = message;
            
            if (this.pendingRequests.has(requestId)) {
              const { resolve, reject } = this.pendingRequests.get(requestId)!;
              this.pendingRequests.delete(requestId);
              
              if (success) {
                const result: PointCloudSmoothingBECPPResult = {
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
                reject(new Error(error || 'C++ BE WebSocket smoothing failed'));
              }
            }
          }
        } catch (error) {
          Log.Error('PointCloudSmoothingBECPP', 'Error parsing WebSocket message', error);
        }
      };
      
      this.ws.onclose = (event) => {
        Log.Info('PointCloudSmoothingBECPP', 'WebSocket disconnected');
        this.ws = null;
        
        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Log.Info('PointCloudSmoothingBECPP', `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
        }
      };
      
      this.ws.onerror = (error) => {
        Log.Error('PointCloudSmoothingBECPP', 'WebSocket error', error);
      };
      
    } catch (error) {
      Log.Error('PointCloudSmoothingBECPP', 'Failed to connect WebSocket', error);
    }
  }

  async pointCloudSmooth(params: PointCloudSmoothingBECPPParams): Promise<PointCloudSmoothingBECPPResult> {
    Log.Info('PointCloudSmoothingBECPP', 'Starting point cloud smoothing via WebSocket', {
      pointCount: params.pointCloudData.length / 3,
      smoothingRadius: params.smoothingRadius,
      iterations: params.iterations
    });
    
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        Log.Error('PointCloudSmoothingBECPP', 'WebSocket not connected', {
          wsExists: !!this.ws,
          readyState: this.ws?.readyState
        });
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = `cpp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the promise resolvers
      this.pendingRequests.set(requestId, { resolve, reject });

      // Send binary data directly - no JSON serialization of points!
      const header = {
        type: 'point_smooth_cpp',
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
          reject(new Error('C++ BE WebSocket request timeout'));
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

