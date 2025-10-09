import { Log } from '../../utils/Log';

// Define types locally to avoid circular imports
export interface ProcessingWorkerMessage {
  type: 'INITIALIZE' | 'VOXEL_DOWNSAMPLE' | 'POINT_CLOUD_SMOOTHING' | 'VOXEL_DEBUG';
  method?: 'TS' | 'WASM' | 'WASM_RUST' | 'BE';
  messageId: number;
  data?: {
    pointCloudData: Float32Array;
    voxelSize?: number;
    globalBounds?: {
      minX: number;
      minY: number;
      minZ: number;
      maxX: number;
      maxY: number;
      maxZ: number;
    };
    smoothingRadius?: number;
    iterations?: number;
    maxVoxels?: number;
  };
}

export interface ProcessingWorkerResponse {
  type: 'SUCCESS' | 'ERROR';
  method?: 'TS' | 'WASM' | 'WASM_RUST' | 'BE';
  messageId: number;
  data?: {
    downsampledPoints?: Float32Array;
    smoothedPoints?: Float32Array;
    voxelCenters?: Float32Array;
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    voxelCount?: number;
    processingTime: number;
  };
  error?: string;
}

export class ProcessingWorker {
  private worker: Worker | null = null;
  private messageCallbacks = new Map<number, { resolve: (response: ProcessingWorkerResponse) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>();
  private nextMessageId = 0;
  public isInitialized = false;

  constructor() {
    try {
      Log.Info('ProcessingWorker', 'Creating worker...');
      // Use the same approach as VoxelDownsampleWorker - Classic Worker
      this.worker = new Worker(
        new URL('./ProcessingWorker.worker.ts', import.meta.url),
        { type: 'classic' }
      );
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);
      Log.Info('ProcessingWorker', 'Worker created successfully');
    } catch (error) {
      Log.Error('ProcessingWorker', 'Failed to create worker', error);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    Log.Info('ProcessingWorker', 'Initializing worker...');
    const messageId = this.nextMessageId++;
    const initPromise = new Promise<ProcessingWorkerResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageCallbacks.delete(messageId);
        reject(new Error('Worker initialization timed out'));
      }, 30000); // 30 seconds timeout

      this.messageCallbacks.set(messageId, { resolve, reject, timeout });
      this.worker?.postMessage({ type: 'INITIALIZE', messageId });
    });

    const response = await initPromise;
    Log.Info('ProcessingWorker', 'Received initialization response:', response);
    if (response.type === 'SUCCESS') {
      this.isInitialized = true;
      Log.Info('ProcessingWorker', 'Worker initialized successfully');
    } else {
      Log.Error('ProcessingWorker', 'Worker initialization failed:', response.error);
      this.isInitialized = false;
      throw new Error(response.error || 'Worker initialization failed');
    }
  }

  async processVoxelDownsampling(
    method: 'TS' | 'WASM' | 'WASM_RUST' | 'BE',
    pointCloudData: Float32Array,
    voxelSize: number,
    globalBounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
  ): Promise<ProcessingWorkerResponse> {
    if (!this.isInitialized || !this.worker) {
      throw new Error('Worker not initialized');
    }

    const messageId = this.nextMessageId++;
    const message: ProcessingWorkerMessage = {
      type: 'VOXEL_DOWNSAMPLE',
      method,
      messageId,
      data: { pointCloudData, voxelSize, globalBounds }
    };

    return this.sendMessageToWorker(message);
  }

  async processPointCloudSmoothing(
    method: 'TS' | 'WASM' | 'WASM_RUST' | 'BE',
    pointCloudData: Float32Array,
    smoothingRadius: number,
    iterations: number
  ): Promise<ProcessingWorkerResponse> {
    if (!this.isInitialized || !this.worker) {
      throw new Error('Worker not initialized');
    }

    const messageId = this.nextMessageId++;
    const message: ProcessingWorkerMessage = {
      type: 'POINT_CLOUD_SMOOTHING',
      method,
      messageId,
      data: { pointCloudData, smoothingRadius, iterations }
    };

    return this.sendMessageToWorker(message);
  }

  private sendMessageToWorker(message: ProcessingWorkerMessage): Promise<ProcessingWorkerResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageCallbacks.delete(message.messageId);
        reject(new Error(`Worker message ${message.type} (ID: ${message.messageId}) timed out`));
      }, 30000); // 30 seconds timeout

      this.messageCallbacks.set(message.messageId, { resolve, reject, timeout });
      this.worker?.postMessage(message, message.data?.pointCloudData ? [message.data.pointCloudData.buffer] : []); // Transferable
    });
  }

  private handleWorkerMessage(event: MessageEvent<ProcessingWorkerResponse>): void {
    const { messageId, type, error } = event.data;
    const callback = this.messageCallbacks.get(messageId);

    if (callback) {
      clearTimeout(callback.timeout);
      this.messageCallbacks.delete(messageId);

      if (type === 'SUCCESS') {
        callback.resolve(event.data);
      } else {
        callback.reject(new Error(error || 'Worker error'));
      }
    } else {
      Log.Warn('ProcessingWorker', 'Received message for unknown messageId:', messageId);
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    Log.Error('ProcessingWorker', 'Worker encountered an error:', error);
    // Reject all pending promises
    this.messageCallbacks.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error(error.message || 'Worker error'));
    });
    this.messageCallbacks.clear();
    this.isInitialized = false; // Mark as uninitialized on error
  }

  dispose(): void {
    if (this.worker) {
      Log.Info('ProcessingWorker', 'Terminating worker...');
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      this.messageCallbacks.forEach(({ reject, timeout }) => {
        clearTimeout(timeout);
        reject(new Error('Worker terminated'));
      });
      this.messageCallbacks.clear();
    }
  }
}