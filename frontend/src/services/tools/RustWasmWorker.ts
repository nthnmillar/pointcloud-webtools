import { Log } from '../../utils/Log';

// Define types for Rust WASM worker
export interface RustWasmWorkerMessage {
  type: 'INITIALIZE' | 'VOXEL_DOWNSAMPLE' | 'POINT_CLOUD_SMOOTHING' | 'VOXEL_DEBUG';
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
  };
}

export interface RustWasmWorkerResponse {
  type: 'SUCCESS' | 'ERROR';
  method: 'WASM_RUST';
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

export class RustWasmWorker {
  private worker: Worker | null = null;
  private messageCallbacks = new Map<number, { resolve: (response: RustWasmWorkerResponse) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>();
  private nextMessageId = 0;
  public isInitialized = false;

  constructor() {
    try {
      Log.Info('RustWasmWorker', 'Creating worker...');
      // Use ES Module Worker approach (matches Vite config)
      this.worker = new Worker(
        new URL('./RustWasmWorker.worker.ts', import.meta.url),
        { type: 'module' }
      );
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);
      Log.Info('RustWasmWorker', 'Worker created successfully');
    } catch (error) {
      Log.Error('RustWasmWorker', 'Failed to create worker', error);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    Log.Info('RustWasmWorker', 'Initializing worker...');
    const messageId = this.nextMessageId++;
    const initPromise = new Promise<RustWasmWorkerResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageCallbacks.delete(messageId);
        reject(new Error('Worker initialization timed out'));
      }, 30000);

      this.messageCallbacks.set(messageId, { resolve, reject, timeout });
      this.worker?.postMessage({ type: 'INITIALIZE', messageId });
    });

    const response = await initPromise;
    if (response.type === 'SUCCESS') {
      this.isInitialized = true;
      Log.Info('RustWasmWorker', 'Worker initialized successfully');
    } else {
      Log.Error('RustWasmWorker', 'Worker initialization failed:', response.error);
      this.isInitialized = false;
      throw new Error(response.error || 'Worker initialization failed');
    }
  }

  async processVoxelDownsampling(
    pointCloudData: Float32Array,
    voxelSize: number,
    globalBounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
  ): Promise<RustWasmWorkerResponse> {
    if (!this.isInitialized || !this.worker) {
      throw new Error('Worker not initialized');
    }

    const messageId = this.nextMessageId++;
    const message: RustWasmWorkerMessage = {
      type: 'VOXEL_DOWNSAMPLE',
      messageId,
      data: { pointCloudData, voxelSize, globalBounds }
    };

    return this.sendMessageToWorker(message);
  }

  async processPointCloudSmoothing(
    pointCloudData: Float32Array,
    smoothingRadius: number,
    iterations: number
  ): Promise<RustWasmWorkerResponse> {
    if (!this.isInitialized || !this.worker) {
      throw new Error('Worker not initialized');
    }

    const messageId = this.nextMessageId++;
    const message: RustWasmWorkerMessage = {
      type: 'POINT_CLOUD_SMOOTHING',
      messageId,
      data: { pointCloudData, smoothingRadius, iterations }
    };

    return this.sendMessageToWorker(message);
  }

  async processVoxelDebug(
    pointCloudData: Float32Array,
    voxelSize: number,
    globalBounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
  ): Promise<RustWasmWorkerResponse> {
    if (!this.isInitialized || !this.worker) {
      throw new Error('Worker not initialized');
    }

    const messageId = this.nextMessageId++;
    const message: RustWasmWorkerMessage = {
      type: 'VOXEL_DEBUG',
      messageId,
      data: { pointCloudData, voxelSize, globalBounds }
    };

    return this.sendMessageToWorker(message);
  }

  private sendMessageToWorker(message: RustWasmWorkerMessage): Promise<RustWasmWorkerResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageCallbacks.delete(message.messageId);
        reject(new Error(`Worker message ${message.type} (ID: ${message.messageId}) timed out`));
      }, 30000);

      this.messageCallbacks.set(message.messageId, { resolve, reject, timeout });
      this.worker?.postMessage(message, message.data?.pointCloudData ? [message.data.pointCloudData.buffer] : []);
    });
  }

  private handleWorkerMessage(event: MessageEvent<RustWasmWorkerResponse>): void {
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
      Log.Warn('RustWasmWorker', 'Received message for unknown messageId:', messageId);
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    Log.Error('RustWasmWorker', 'Worker encountered an error:', error);
    this.messageCallbacks.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error(error.message || 'Worker error'));
    });
    this.messageCallbacks.clear();
    this.isInitialized = false;
  }

  dispose(): void {
    if (this.worker) {
      Log.Info('RustWasmWorker', 'Terminating worker...');
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



