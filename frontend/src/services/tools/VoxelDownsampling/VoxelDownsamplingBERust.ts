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

interface VoxelDownsampleRustResponseHeader {
  type: 'voxel_downsample_rust_result';
  requestId: string;
  success: boolean;
  originalCount: number;
  downsampledCount: number;
  voxelCount: number;
  processingTime: number;
  dataLength: number;
  error?: string;
}

export class VoxelDownsamplingBERust extends BaseService {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, { resolve: (value: VoxelDownsamplingBERustResult) => void; reject: (reason?: unknown) => void }>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingHeader: VoxelDownsampleRustResponseHeader | null = null; // Track pending binary data header

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
      
      this.ws.onmessage = async (event) => {
        try {
          // Check if this is binary data or JSON header
          if (event.data instanceof ArrayBuffer) {
            // This is binary data
            if (this.pendingHeader && this.pendingHeader.type === 'voxel_downsample_rust_result' && this.pendingHeader.success) {
              // Create Float32Array directly from binary data (zero-copy!)
              const downsampledPoints = new Float32Array(event.data, 0, this.pendingHeader.dataLength);
              
              const pending = this.pendingRequests.get(this.pendingHeader.requestId);
              if (pending) {
                this.pendingRequests.delete(this.pendingHeader.requestId);
                
                const result: VoxelDownsamplingBERustResult = {
                  success: true,
                  downsampledPoints: downsampledPoints,
                  originalCount: this.pendingHeader.originalCount,
                  downsampledCount: this.pendingHeader.downsampledCount,
                  processingTime: this.pendingHeader.processingTime,
                  reductionRatio: this.pendingHeader.originalCount / this.pendingHeader.downsampledCount,
                  voxelCount: this.pendingHeader.voxelCount || this.pendingHeader.downsampledCount
                };
                pending.resolve(result);
              }
              this.pendingHeader = null;
            }
          } else if (event.data instanceof Blob) {
            // Convert Blob to ArrayBuffer
            const arrayBuffer = await event.data.arrayBuffer();
            if (this.pendingHeader && this.pendingHeader.type === 'voxel_downsample_rust_result' && this.pendingHeader.success) {
              const downsampledPoints = new Float32Array(arrayBuffer, 0, this.pendingHeader.dataLength);
              
              const pending = this.pendingRequests.get(this.pendingHeader.requestId);
              if (pending) {
                this.pendingRequests.delete(this.pendingHeader.requestId);
                
                const result: VoxelDownsamplingBERustResult = {
                  success: true,
                  downsampledPoints: downsampledPoints,
                  originalCount: this.pendingHeader.originalCount,
                  downsampledCount: this.pendingHeader.downsampledCount,
                  processingTime: this.pendingHeader.processingTime,
                  reductionRatio: this.pendingHeader.originalCount / this.pendingHeader.downsampledCount,
                  voxelCount: this.pendingHeader.voxelCount || this.pendingHeader.downsampledCount
                };
                pending.resolve(result);
              }
              this.pendingHeader = null;
            }
          } else {
            // This is JSON header
            const message = JSON.parse(event.data as string);
            
            if (message.type === 'voxel_downsample_rust_result') {
              if (message.success && message.dataLength) {
                // Store header and wait for binary data
                this.pendingHeader = message;
              } else {
                // Error response (no binary data)
                const { requestId, error } = message;
                const pending = this.pendingRequests.get(requestId);
                if (pending) {
                  this.pendingRequests.delete(requestId);
                  pending.reject(new Error(error || 'Rust BE WebSocket processing failed'));
                }
              }
            }
          }
        } catch (error) {
          Log.Error('VoxelDownsamplingBERust', 'Error parsing WebSocket message', error);
        }
      };
      
      this.ws.onclose = (_event) => {
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
