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

export class VoxelDownsamplingBEPython extends BaseService {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, { resolve: (value: VoxelDownsamplingBEPythonResult) => void; reject: (reason?: any) => void }>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

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
      Log.Info('VoxelDownsamplingBEPython', 'Connecting to WebSocket', { baseUrl: 'ws://localhost:3003' });
      
      this.ws = new WebSocket('ws://localhost:3003');
      
      this.ws.onopen = () => {
        Log.Info('VoxelDownsamplingBEPython', 'WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'voxel_downsample_python_result') {
            const requestId = data.requestId;
            const pendingRequest = this.pendingRequests.get(requestId);
            
            if (pendingRequest) {
              this.pendingRequests.delete(requestId);
              
              if (data.success) {
                // Access nested data object
                const resultData = data.data;
                
                // Convert ArrayBuffer back to Float32Array
                const downsampledPoints = new Float32Array(resultData.downsampledPoints);
                
                const result: VoxelDownsamplingBEPythonResult = {
                  success: true,
                  downsampledPoints,
                  originalCount: resultData.originalCount,
                  downsampledCount: resultData.downsampledCount,
                  processingTime: resultData.processingTime,
                  voxelSize: resultData.voxelSize,
                  voxelCount: resultData.voxelCount
                };
                
                pendingRequest.resolve(result);
              } else {
                pendingRequest.reject(new Error(data.error || 'Voxel downsampling failed'));
              }
            }
          }
        } catch (error) {
          Log.Error('VoxelDownsamplingBEPython', 'Error parsing WebSocket message', error);
        }
      };

      this.ws.onclose = () => {
        Log.Info('VoxelDownsamplingBEPython', 'WebSocket disconnected');
        this.ws = null;
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Log.Info('VoxelDownsamplingBEPython', `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectDelay);
        }
      };

      this.ws.onerror = (error) => {
        Log.Error('VoxelDownsamplingBEPython', 'WebSocket error', error);
      };
    } catch (error) {
      Log.Error('VoxelDownsamplingBEPython', 'Failed to connect WebSocket', error);
    }
  }

  public async performVoxelDownsampling(params: VoxelDownsamplingBEPythonParams): Promise<VoxelDownsamplingBEPythonResult> {
    Log.Info('VoxelDownsamplingBEPython', 'Starting voxel downsampling via WebSocket', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize
    });

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
        dataLength: params.pointCloudData.length
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
