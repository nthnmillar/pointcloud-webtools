import { BaseService } from '../../BaseService';
import { Log } from '../../../utils/Log';

export interface VoxelDownsampleParams {
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

export interface VoxelDownsampleResult {
  success: boolean;
  downsampledPoints?: Float32Array;
  originalCount?: number;
  downsampledCount?: number;
  processingTime?: number;
  voxelCount?: number;
  error?: string;
}

export class VoxelDownsamplingWebSocket extends BaseService {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, {
    resolve: (result: VoxelDownsampleResult) => void;
    reject: (error: Error) => void;
  }>();

  constructor() {
    super();
    this.connect();
  }

  async initialize(..._args: unknown[]): Promise<void> {
    // Connection is already established in constructor
    // Mark as initialized once WebSocket is connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.isInitialized = true;
    } else {
      // Wait for connection to open
      return new Promise((resolve) => {
        if (this.ws) {
          const originalOnOpen = this.ws.onopen;
          const wsRef = this.ws;
          this.ws.onopen = (event) => {
            if (originalOnOpen) {
              originalOnOpen.call(wsRef, event);
            }
            this.isInitialized = true;
            resolve();
          };
        } else {
          // If ws is null, connection will be established and we'll be initialized then
          this.isInitialized = true;
          resolve();
        }
      });
    }
  }

  dispose(): void {
    this.destroy();
    this.removeAllObservers();
  }

  private connect(): void {
    try {
      Log.Info('VoxelDownsamplingWebSocket', 'Attempting to connect to WebSocket...');
      this.ws = new WebSocket('ws://localhost:3003');
      
      this.ws.onopen = () => {
        Log.Info('VoxelDownsamplingWebSocket', 'WebSocket connected successfully');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'voxel_downsample_result') {
            const { requestId, success, downsampledPoints, originalCount, downsampledCount, voxelCount, processingTime, error } = message;
            
            const pendingRequest = this.pendingRequests.get(requestId);
            if (pendingRequest) {
              this.pendingRequests.delete(requestId);
              
              if (success) {
                pendingRequest.resolve({
                  success: true,
                  downsampledPoints: new Float32Array(downsampledPoints),
                  originalCount,
                  downsampledCount,
                  voxelCount,
                  processingTime
                });
              } else {
                pendingRequest.reject(new Error(error || 'Unknown error'));
              }
            }
          }
        } catch (error) {
          Log.Error('VoxelDownsamplingWebSocket', 'Error parsing WebSocket message', error);
        }
      };

      this.ws.onclose = () => {
        Log.Warn('VoxelDownsamplingWebSocket', 'WebSocket disconnected, reconnecting in 3 seconds');
        setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = (error) => {
        Log.Error('VoxelDownsamplingWebSocket', 'WebSocket error', error);
      };
    } catch (error) {
      Log.Error('VoxelDownsamplingWebSocket', 'Failed to connect WebSocket', error);
    }
  }

  async voxelDownsample(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    Log.Info('VoxelDownsamplingWebSocket', 'Starting voxel downsampling via WebSocket', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize
    });
    
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        Log.Error('VoxelDownsamplingWebSocket', 'WebSocket not connected', {
          wsExists: !!this.ws,
          readyState: this.ws?.readyState
        });
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = `voxel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the promise resolvers
      this.pendingRequests.set(requestId, { resolve, reject });

      // Send binary data directly - no JSON serialization of points!
      const header = {
        type: 'voxel_downsample',
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
          reject(new Error('WebSocket request timeout'));
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
