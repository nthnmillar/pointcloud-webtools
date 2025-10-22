import { Log } from '../../../utils/Log';
import { BaseService } from '../../BaseService';

export interface VoxelDownsamplingBERustParams {
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

export interface VoxelDownsamplingBERustResult {
  success: boolean;
  downsampledPoints: Float32Array;
  originalCount: number;
  downsampledCount: number;
  processingTime: number;
  reductionRatio: number;
  voxelCount: number;
}

export class VoxelDownsamplingBERust extends BaseService {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, { resolve: (value: VoxelDownsamplingBERustResult) => void; reject: (reason?: any) => void }>();
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
        Log.Info('VoxelDownsamplingBERust', 'Connecting to WebSocket', { baseUrl: 'ws://localhost:3003' });
      
      this.ws = new WebSocket('ws://localhost:3003');
      
      this.ws.onopen = () => {
        Log.Info('VoxelDownsamplingBERust', 'WebSocket connected');
        this.reconnectAttempts = 0;
        
        // Send a test message to verify connection
        this.ws.send(JSON.stringify({ type: 'test', message: 'Hello from frontend' }));
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'voxel_downsample_rust_result') {
            const { requestId, success, error, data } = message;
            
            if (this.pendingRequests.has(requestId)) {
              const { resolve, reject } = this.pendingRequests.get(requestId)!;
              this.pendingRequests.delete(requestId);
              
              if (success) {
                const result: VoxelDownsamplingBERustResult = {
                  success: true,
                  downsampledPoints: new Float32Array(data.downsampledPoints),
                  originalCount: data.originalCount,
                  downsampledCount: data.downsampledCount,
                  processingTime: data.processingTime,
                  reductionRatio: data.originalCount / data.downsampledCount,
                  voxelCount: data.downsampledCount / 3
                };
                resolve(result);
              } else {
                reject(new Error(error || 'Rust BE WebSocket processing failed'));
              }
            }
          }
        } catch (error) {
          Log.Error('VoxelDownsamplingBERust', 'Error parsing WebSocket message', error);
        }
      };
      
      this.ws.onclose = (event) => {
        Log.Info('VoxelDownsamplingBERust', 'WebSocket disconnected');
        this.ws = null;
        
        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Log.Info('VoxelDownsamplingBERust', `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
        }
      };
      
      this.ws.onerror = (error) => {
        Log.Error('VoxelDownsamplingBERust', 'WebSocket error', error);
      };
      
    } catch (error) {
      Log.Error('VoxelDownsamplingBERust', 'Failed to connect WebSocket', error);
    }
  }

  async voxelDownsample(params: VoxelDownsamplingBERustParams): Promise<VoxelDownsamplingBERustResult> {
    Log.Info('VoxelDownsamplingBERust', 'Starting voxel downsampling via WebSocket', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize
    });
    
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        Log.Error('VoxelDownsamplingBERust', 'WebSocket not connected', {
          wsExists: !!this.ws,
          readyState: this.ws?.readyState
        });
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = `voxel_rust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the promise resolvers
      this.pendingRequests.set(requestId, { resolve, reject });

      // Send binary data directly - no JSON serialization of points!
      const header = {
        type: 'voxel_downsample_rust',
        requestId,
        voxelSize: params.voxelSize,
        globalBounds: params.globalBounds,
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
          reject(new Error('Rust BE WebSocket request timeout'));
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
