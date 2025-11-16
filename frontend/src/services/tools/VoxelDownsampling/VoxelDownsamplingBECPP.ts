import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
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

export class VoxelDownsamplingBECPP extends BaseService {
  private ws: WebSocket | null = null
  private pendingRequests = new Map<string, { resolve: (value: VoxelDownsampleResult) => void; reject: (reason?: any) => void }>()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private pendingHeader: any = null // Track pending binary data header

  constructor(serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    this.connect();
    this.isInitialized = true;
  }

  private connect(): void {
    try {
      Log.Info('VoxelDownsamplingBECPP', 'Connecting to WebSocket', { baseUrl: 'ws://localhost:3003' });
      this.ws = new WebSocket('ws://localhost:3003');
      
      this.ws.onopen = () => {
        Log.Info('VoxelDownsamplingBECPP', 'WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = async (event) => {
        try {
          // Check if this is binary data or JSON header
          if (event.data instanceof ArrayBuffer) {
            // This is binary data
            if (this.pendingHeader && this.pendingHeader.type === 'voxel_downsample_result' && this.pendingHeader.success) {
              // Create Float32Array directly from binary data (zero-copy!)
              const downsampledPoints = new Float32Array(event.data, 0, this.pendingHeader.dataLength);
              
              const pending = this.pendingRequests.get(this.pendingHeader.requestId);
              if (pending) {
                this.pendingRequests.delete(this.pendingHeader.requestId);
                
                const result: VoxelDownsampleResult = {
                  success: true,
                  downsampledPoints: downsampledPoints,
                  originalCount: this.pendingHeader.originalCount,
                  downsampledCount: this.pendingHeader.downsampledCount,
                  voxelCount: this.pendingHeader.voxelCount,
                  processingTime: this.pendingHeader.processingTime
                };
                pending.resolve(result);
              }
              this.pendingHeader = null;
            }
          } else if (event.data instanceof Blob) {
            // Convert Blob to ArrayBuffer
            const arrayBuffer = await event.data.arrayBuffer();
            if (this.pendingHeader && this.pendingHeader.type === 'voxel_downsample_result' && this.pendingHeader.success) {
              const downsampledPoints = new Float32Array(arrayBuffer, 0, this.pendingHeader.dataLength);
              
              const pending = this.pendingRequests.get(this.pendingHeader.requestId);
              if (pending) {
                this.pendingRequests.delete(this.pendingHeader.requestId);
                
                const result: VoxelDownsampleResult = {
                  success: true,
                  downsampledPoints: downsampledPoints,
                  originalCount: this.pendingHeader.originalCount,
                  downsampledCount: this.pendingHeader.downsampledCount,
                  voxelCount: this.pendingHeader.voxelCount,
                  processingTime: this.pendingHeader.processingTime
                };
                pending.resolve(result);
              }
              this.pendingHeader = null;
            }
          } else {
            // This is JSON header
            const message = JSON.parse(event.data as string);
            
            if (message.type === 'voxel_downsample_result') {
              if (message.success && message.dataLength) {
                // Store header and wait for binary data
                this.pendingHeader = message;
              } else {
                // Error response (no binary data)
                const { requestId, error } = message;
                const pending = this.pendingRequests.get(requestId);
                if (pending) {
                  this.pendingRequests.delete(requestId);
                  pending.reject(new Error(error || 'Unknown error'));
                }
              }
            }
          }
        } catch (error) {
          Log.Error('VoxelDownsamplingBECPP', 'Error parsing WebSocket message', error);
        }
      };

      this.ws.onclose = () => {
        Log.Info('VoxelDownsamplingBECPP', 'WebSocket disconnected');
        this.ws = null;
        
        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Log.Info('VoxelDownsamplingBECPP', `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
        }
      };

      this.ws.onerror = (error) => {
        Log.Error('VoxelDownsamplingBECPP', 'WebSocket error', error);
      };
    } catch (error) {
      Log.Error('VoxelDownsamplingBECPP', 'Failed to connect WebSocket', error);
    }
  }

  async voxelDownsample(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    Log.Info('VoxelDownsamplingBECPP', 'Starting backend voxel downsampling via WebSocket', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize
    });
    
    // Wait for WebSocket to be connected (with timeout)
    const maxWaitTime = 5000; // 5 seconds
    const checkInterval = 100; // Check every 100ms
    const startWait = Date.now();
    
    while (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (Date.now() - startWait > maxWaitTime) {
        throw new Error('WebSocket connection timeout');
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    return new Promise((resolve, reject) => {
      const requestId = `voxel_cpp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
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
      this.ws!.send(JSON.stringify(header));
      
      // Send binary data directly (fast - zero-copy!)
      this.ws!.send(params.pointCloudData.buffer);

      // Set a timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('C++ BE WebSocket request timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  dispose(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

