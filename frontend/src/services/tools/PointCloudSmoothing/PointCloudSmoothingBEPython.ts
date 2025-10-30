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

interface WebSocketMessage {
  type: string;
  requestId?: string;
  success?: boolean;
  error?: string;
  data?: {
    smoothedPoints?: number[];
    originalCount?: number;
    smoothedCount?: number;
    processingTime?: number;
    smoothingRadius?: number;
    iterations?: number;
  };
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
      Log.Info('PointCloudSmoothingBEPython', 'Connecting to WebSocket', { baseUrl: 'ws://localhost:3003' });
      
      this.ws = new WebSocket('ws://localhost:3003');
      
      this.ws.onopen = () => {
        Log.Info('PointCloudSmoothingBEPython', 'WebSocket connected');
        this.reconnectAttempts = 0;
      };
      
      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data as string);
          
          if (message.type === 'point_smooth_python_result') {
            const { requestId, success, error, data } = message;
            
            if (requestId && this.pendingRequests.has(requestId)) {
              const request = this.pendingRequests.get(requestId);
              if (request) {
                this.pendingRequests.delete(requestId);
                
                if (success && data) {
                  const result: PointCloudSmoothingBEPythonResult = {
                    success: true,
                    smoothedPoints: new Float32Array(data.smoothedPoints || []),
                    originalCount: data.originalCount || 0,
                    smoothedCount: data.smoothedCount || 0,
                    processingTime: data.processingTime || 0,
                    smoothingRadius: data.smoothingRadius || 0,
                    iterations: data.iterations || 0
                  };
                  request.resolve(result);
                } else {
                  request.reject(new Error(error || 'Python BE WebSocket smoothing failed'));
                }
              }
            } else {
              console.warn('🔧 PointCloudSmoothingBEPython disposed: No pending request found for', requestId);
            }
          }
        } catch (error) {
          console.error('🔧 PointCloudSmoothingBEPython: Error parsing WebSocket message', error);
          Log.Error('PointCloudSmoothingBEPython', 'Error parsing WebSocket message', error);
        }
      };
      
      this.ws.onclose = () => {
        Log.Info('PointCloudSmoothingBEPython', 'WebSocket disconnected');
        this.ws = null;
        
        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Log.Info('PointCloudSmoothingBEPython', `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
        }
      };
      
      this.ws.onerror = (error: Event) => {
        Log.Error('PointCloudSmoothingBEPython', 'WebSocket error', error);
        console.error('🔧 PointCloudSmoothingBEPython: WebSocket error:', error);
      };
      
    } catch (error) {
      console.error('🔧 PointCloudSmoothingBEPython: Failed to connect WebSocket:', error);
      Log.Error('PointCloudSmoothingBEPython', 'Failed to connect WebSocket', error);
    }
  }

  async pointCloudSmooth(params: PointCloudSmoothingBEPythonParams): Promise<PointCloudSmoothingBEPythonResult> {
    Log.Info('PointCloudSmoothingBEPython', 'Starting point cloud smoothing via WebSocket', {
      pointCount: params.pointCloudData.length / 3,
      smoothingRadius: params.smoothingRadius,
      iterations: params.iterations
    });
    
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.error('🔧 PointCloudSmoothingBEPython: WebSocket not connected', {
          wsExists: !!this.ws,
          readyState: this.ws?.readyState,
          expectedState: WebSocket.OPEN
        });
        Log.Error('PointCloudSmoothingBEPython', 'WebSocket not connected', {
          wsExists: !!this.ws,
          readyState: this.ws?.readyState
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

