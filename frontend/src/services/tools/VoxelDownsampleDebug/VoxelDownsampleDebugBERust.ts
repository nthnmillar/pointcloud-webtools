import { Log } from '../../../utils/Log';
import { BaseService } from '../../BaseService';

export interface VoxelDownsampleDebugBERustParams {
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

export interface VoxelDownsampleDebugBERustResult {
  success: boolean;
  voxelGridPositions: Float32Array;
  voxelCount: number;
  processingTime: number;
}

export class VoxelDownsampleDebugBERust extends BaseService {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, { resolve: (value: VoxelDownsampleDebugBERustResult) => void; reject: (reason?: any) => void }>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(baseUrl: string = 'ws://localhost:3003') {
    super();
    this.connect();
  }

  private connect(): void {
    try {
      Log.Info('VoxelDownsampleDebugBERust', 'Connecting to WebSocket', { baseUrl: 'ws://localhost:3003' });
      
      this.ws = new WebSocket('ws://localhost:3003');
      console.log('🔧 VoxelDownsampleDebugBERust: WebSocket created', this.ws);
      
      this.ws.onopen = () => {
        Log.Info('VoxelDownsampleDebugBERust', 'WebSocket connected');
        this.reconnectAttempts = 0;
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'voxel_debug_rust_result') {
            const { requestId, success, error, data } = message;
            
            if (this.pendingRequests.has(requestId)) {
              const { resolve, reject } = this.pendingRequests.get(requestId)!;
              this.pendingRequests.delete(requestId);
              
              if (success) {
                const result: VoxelDownsampleDebugBERustResult = {
                  success: true,
                  voxelGridPositions: new Float32Array(data.voxelGridPositions),
                  voxelCount: data.voxelCount,
                  processingTime: data.processingTime
                };
                resolve(result);
              } else {
                reject(new Error(error || 'Rust BE WebSocket debug generation failed'));
              }
            }
          }
        } catch (error) {
          Log.Error('VoxelDownsampleDebugBERust', 'Error parsing WebSocket message', error);
        }
      };
      
      this.ws.onclose = () => {
        Log.Info('VoxelDownsampleDebugBERust', 'WebSocket disconnected');
        this.ws = null;
        
        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Log.Info('VoxelDownsampleDebugBERust', `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
        }
      };
      
      this.ws.onerror = (error) => {
        Log.Error('VoxelDownsampleDebugBERust', 'WebSocket error', error);
      };
      
    } catch (error) {
      Log.Error('VoxelDownsampleDebugBERust', 'Failed to connect WebSocket', error);
    }
  }

  async generateVoxelCenters(params: VoxelDownsampleDebugBERustParams): Promise<VoxelDownsampleDebugBERustResult> {
    console.log('🔧 VoxelDownsampleDebugBERust: generateVoxelCenters called', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize,
      wsState: this.ws?.readyState
    });
    Log.Info('VoxelDownsampleDebugBERust', 'Starting voxel debug generation via WebSocket', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize
    });
    
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        Log.Error('VoxelDownsampleDebugBERust', 'WebSocket not connected', {
          wsExists: !!this.ws,
          readyState: this.ws?.readyState
        });
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = `debug_rust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the promise resolvers
      this.pendingRequests.set(requestId, { resolve, reject });

      // Send binary data directly - no JSON serialization of points!
      const header = {
        type: 'voxel_debug_rust',
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
          reject(new Error('Rust BE WebSocket debug timeout'));
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
