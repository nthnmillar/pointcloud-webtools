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

interface VoxelDebugRustResponseHeader {
  type: 'voxel_debug_rust_result';
  requestId: string;
  success: boolean;
  voxelCount: number;
  processingTime: number;
  dataLength: number;
  error?: string;
}

export class VoxelDownsampleDebugBERust extends BaseService {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, { resolve: (value: VoxelDownsampleDebugBERustResult) => void; reject: (reason?: unknown) => void }>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingHeader: VoxelDebugRustResponseHeader | null = null; // Track pending binary data header

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
      Log.Info('VoxelDownsampleDebugBERust', 'Connecting to WebSocket', { baseUrl: 'ws://localhost:3003' });
      
      this.ws = new WebSocket('ws://localhost:3003');
      
      this.ws.onopen = () => {
        Log.Info('VoxelDownsampleDebugBERust', 'WebSocket connected');
        this.reconnectAttempts = 0;
      };
      
      this.ws.onmessage = async (event) => {
        try {
          // Check if this is binary data or JSON header
          if (event.data instanceof ArrayBuffer) {
            // This is binary data
            if (this.pendingHeader && this.pendingHeader.type === 'voxel_debug_rust_result' && this.pendingHeader.success) {
              // Create Float32Array directly from binary data (zero-copy!)
              const voxelGridPositions = new Float32Array(event.data, 0, this.pendingHeader.dataLength);
              
              const pending = this.pendingRequests.get(this.pendingHeader.requestId);
              if (pending) {
                this.pendingRequests.delete(this.pendingHeader.requestId);
                
                const result: VoxelDownsampleDebugBERustResult = {
                  success: true,
                  voxelGridPositions: voxelGridPositions,
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
            if (this.pendingHeader && this.pendingHeader.type === 'voxel_debug_rust_result' && this.pendingHeader.success) {
              const voxelGridPositions = new Float32Array(arrayBuffer, 0, this.pendingHeader.dataLength);
              
              const pending = this.pendingRequests.get(this.pendingHeader.requestId);
              if (pending) {
                this.pendingRequests.delete(this.pendingHeader.requestId);
                
                const result: VoxelDownsampleDebugBERustResult = {
                  success: true,
                  voxelGridPositions: voxelGridPositions,
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
            
            if (message.type === 'voxel_debug_rust_result') {
              if (message.success && message.dataLength) {
                // Store header and wait for binary data
                this.pendingHeader = message;
              } else {
                // Error response (no binary data)
                const { requestId, error } = message;
                const pending = this.pendingRequests.get(requestId);
                if (pending) {
                  this.pendingRequests.delete(requestId);
                  pending.reject(new Error(error || 'Rust BE WebSocket debug processing failed'));
                }
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
    Log.Info('VoxelDownsampleDebugBERust', 'Starting voxel debug generation via WebSocket', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize
    });
    
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        Log.Error('VoxelDownsampleDebugBERust', 'WebSocket not connected', {
          wsExists: !!this.ws,
          readyState: this.ws?.readyState,
          expectedState: WebSocket.OPEN
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
