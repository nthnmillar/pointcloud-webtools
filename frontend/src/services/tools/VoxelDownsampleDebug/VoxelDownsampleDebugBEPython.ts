import { Log } from '../../../utils/Log';
import { BaseService } from '../../BaseService';
import type { VoxelDebugParams, VoxelDebugResult } from './VoxelDownsampleDebugService';

interface WebSocketMessage {
  type: string;
  requestId?: string;
  success?: boolean;
  error?: string;
  data?: {
    voxelGridPositions?: number[];
    voxelCount?: number;
    processingTime?: number;
  };
}

interface PendingRequest {
  resolve: (value: VoxelDebugResult) => void;
  reject: (reason?: Error) => void;
}

export class VoxelDownsampleDebugBEPython extends BaseService {
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
      Log.Info('VoxelDownsampleDebugBEPython', 'Connecting to WebSocket', { baseUrl: 'ws://localhost:3003' });
      
      this.ws = new WebSocket('ws://localhost:3003');
      
      this.ws.onopen = () => {
        Log.Info('VoxelDownsampleDebugBEPython', 'WebSocket connected');
        this.reconnectAttempts = 0;
      };
      
      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data as string);
          
          if (message.type === 'voxel_debug_python_result') {
            const { requestId, success, error, data } = message;
            
            if (requestId && this.pendingRequests.has(requestId)) {
              const request = this.pendingRequests.get(requestId);
              if (request) {
                this.pendingRequests.delete(requestId);
                
                if (success && data) {
                  const result: VoxelDebugResult = {
                    success: true,
                    voxelGridPositions: new Float32Array(data.voxelGridPositions || []),
                    voxelCount: data.voxelCount || 0,
                    processingTime: data.processingTime || 0
                  };
                  request.resolve(result);
                } else {
                  console.error('🔧 VoxelDownsampleDebugBEPython: Rejecting with error', error);
                  request.reject(new Error(error || 'Python BE WebSocket debug generation failed'));
                }
              }
            } else {
              console.warn('🔧 VoxelDownsampleDebugBEPython: No pending request found for', requestId);
            }
          }
        } catch (error) {
          console.error('🔧 VoxelDownsampleDebugBEPython: Error parsing WebSocket message', error);
          Log.Error('VoxelDownsampleDebugBEPython', 'Error parsing WebSocket message', error);
        }
      };
      
      this.ws.onclose = () => {
        Log.Info('VoxelDownsampleDebugBEPython', 'WebSocket disconnected');
        this.ws = null;
        
        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Log.Info('VoxelDownsampleDebugBEPython', `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
        }
      };
      
      this.ws.onerror = (error: Event) => {
        Log.Error('VoxelDownsampleDebugBEPython', 'WebSocket error', error);
        console.error('🔧 VoxelDownsampleDebugBEPython: WebSocket error:', error);
      };
      
    } catch (error) {
      console.error('🔧 VoxelDownsampleDebugBEPython: Failed to connect WebSocket:', error);
      Log.Error('VoxelDownsampleDebugBEPython', 'Failed to connect WebSocket', error);
    }
  }

  async generateVoxelCenters(params: VoxelDebugParams): Promise<VoxelDebugResult> {
    Log.Info('VoxelDownsampleDebugBEPython', 'Starting voxel debug generation via WebSocket', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize
    });
    
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.error('🔧 VoxelDownsampleDebugBEPython: WebSocket not connected', {
          wsExists: !!this.ws,
          readyState: this.ws?.readyState,
          expectedState: WebSocket.OPEN
        });
        Log.Error('VoxelDownsampleDebugBEPython', 'WebSocket not connected', {
          wsExists: !!this.ws,
          readyState: this.ws?.readyState
        });
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = `debug_python_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the promise resolvers
      this.pendingRequests.set(requestId, { resolve, reject });

      // Send binary data directly - no JSON serialization of points!
      const header = {
        type: 'voxel_debug_python',
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
          reject(new Error('Python BE WebSocket debug timeout'));
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

