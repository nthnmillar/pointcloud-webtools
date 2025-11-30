import { Log } from '../../utils/Log';

// Define types for C++ WASM worker
export interface CppWasmWorkerMessage {
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

export interface CppWasmWorkerResponse {
  type: 'SUCCESS' | 'ERROR';
  method: 'WASM_CPP';
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

interface WorkerReadyMessage {
  type: 'WORKER_READY';
  method: string;
  messageId: number;
  data?: unknown;
}

interface WasmMemoryBuffer extends ArrayBuffer {
  maxByteLength: number;
}

export class CppWasmWorker {
  private worker: Worker | null = null;
  private messageCallbacks = new Map<number, { resolve: (response: CppWasmWorkerResponse) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>();
  private nextMessageId = 0;
  public isInitialized = false;

  constructor() {
    try {
      Log.Info('CppWasmWorker', 'Creating worker...');
      const workerUrl = new URL('./CppWasmWorker.worker.ts', import.meta.url);
      Log.Info('CppWasmWorker', 'Worker URL:', workerUrl.href);
      
      // Use module worker approach (like VoxelDownsampleWorker)
      this.worker = new Worker(workerUrl, { type: 'module' });
      Log.Info('CppWasmWorker', 'Worker instance created');
      
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      Log.Info('CppWasmWorker', 'onmessage handler attached');
      
      this.worker.onerror = this.handleWorkerError.bind(this);
      Log.Info('CppWasmWorker', 'onerror handler attached');
      
      Log.Info('CppWasmWorker', 'Worker created successfully');
    } catch (error) {
      Log.Error('CppWasmWorker', 'Failed to create worker', error);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    Log.Info('CppWasmWorker', 'Initializing worker...');
    const messageId = this.nextMessageId++;
    Log.Info('CppWasmWorker', 'Created initialization message with ID:', messageId);
    
    const initPromise = new Promise<CppWasmWorkerResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        Log.Error('CppWasmWorker', 'Initialization timeout after 30 seconds');
        this.messageCallbacks.delete(messageId);
        reject(new Error('Worker initialization timed out'));
      }, 30000);

      this.messageCallbacks.set(messageId, { resolve, reject, timeout });
      Log.Info('CppWasmWorker', 'Sending INITIALIZE message to worker', { messageId, workerExists: !!this.worker });
      
      if (!this.worker) {
        reject(new Error('Worker is null'));
        return;
      }
      
      this.worker.postMessage({ type: 'INITIALIZE', messageId });
      Log.Info('CppWasmWorker', 'INITIALIZE message sent to worker');
    });

    Log.Info('CppWasmWorker', 'Waiting for worker response...');
    const response = await initPromise;
    Log.Info('CppWasmWorker', 'Received response from worker', response);
    
    if (response.type === 'SUCCESS') {
      this.isInitialized = true;
      Log.Info('CppWasmWorker', 'Worker initialized successfully');
    } else {
      Log.Error('CppWasmWorker', 'Worker initialization failed:', response.error);
      this.isInitialized = false;
      throw new Error(response.error || 'Worker initialization failed');
    }
  }

  async processVoxelDownsampling(
    pointCloudData: Float32Array,
    voxelSize: number,
    globalBounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
  ): Promise<CppWasmWorkerResponse> {
    if (!this.isInitialized || !this.worker) {
      throw new Error('Worker not initialized');
    }

    const messageId = this.nextMessageId++;
    const message: CppWasmWorkerMessage = {
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
  ): Promise<CppWasmWorkerResponse> {
    if (!this.isInitialized || !this.worker) {
      throw new Error('Worker not initialized');
    }

    const messageId = this.nextMessageId++;
    const message: CppWasmWorkerMessage = {
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
  ): Promise<CppWasmWorkerResponse> {
    if (!this.isInitialized || !this.worker) {
      throw new Error('Worker not initialized');
    }

    const messageId = this.nextMessageId++;
    const message: CppWasmWorkerMessage = {
      type: 'VOXEL_DEBUG',
      messageId,
      data: { pointCloudData, voxelSize, globalBounds }
    };

    return this.sendMessageToWorker(message);
  }

  private sendMessageToWorker(message: CppWasmWorkerMessage): Promise<CppWasmWorkerResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageCallbacks.delete(message.messageId);
        reject(new Error(`Worker message ${message.type} (ID: ${message.messageId}) timed out`));
      }, 30000);

      this.messageCallbacks.set(message.messageId, { resolve, reject, timeout });
      // Clone data if it might be WASM memory (WASM buffers cannot be transferred)
      // Check if buffer is transferable - WASM/asm.js ArrayBuffers are not transferable
      const transferBuffers: ArrayBuffer[] = [];
      if (message.data?.pointCloudData) {
        const buffer = message.data.pointCloudData.buffer;
        // Check if it's WASM memory (has maxByteLength property) or SharedArrayBuffer
        // WASM memory buffers cannot be transferred, so clone the data
        const isSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer;
        const isWasmMemory = 'maxByteLength' in buffer && typeof (buffer as WasmMemoryBuffer).maxByteLength === 'number';
        
        if (isSharedArrayBuffer || isWasmMemory) {
          message.data.pointCloudData = new Float32Array(message.data.pointCloudData);
        }
        // Only push if it's an ArrayBuffer (not SharedArrayBuffer or WASM memory)
        const finalBuffer = message.data.pointCloudData.buffer;
        if (finalBuffer instanceof ArrayBuffer && !(typeof SharedArrayBuffer !== 'undefined' && finalBuffer instanceof SharedArrayBuffer)) {
          transferBuffers.push(finalBuffer);
        }
      }
      this.worker?.postMessage(message, transferBuffers.length > 0 ? transferBuffers : []);
    });
  }

  private handleWorkerMessage(event: MessageEvent<CppWasmWorkerResponse | WorkerReadyMessage>): void {
    const { messageId, type } = event.data;
    const error = 'error' in event.data ? event.data.error : undefined;
    Log.Info('CppWasmWorker', 'Received worker message', { messageId, type, error, availableCallbacks: Array.from(this.messageCallbacks.keys()) });
    
    // Handle worker ready signal
    if (type === 'WORKER_READY') {
      Log.Info('CppWasmWorker', 'Worker is ready and running');
      return;
    }
    
    const callback = this.messageCallbacks.get(messageId);

    if (callback) {
      Log.Info('CppWasmWorker', 'Found callback for messageId', messageId);
      clearTimeout(callback.timeout);
      this.messageCallbacks.delete(messageId);

      if (type === 'SUCCESS') {
        Log.Info('CppWasmWorker', 'Resolving callback with success');
        callback.resolve(event.data as CppWasmWorkerResponse);
      } else {
        Log.Error('CppWasmWorker', 'Rejecting callback with error', error);
        callback.reject(new Error(error || 'Worker error'));
      }
    } else {
      Log.Warn('CppWasmWorker', 'Received message for unknown messageId: ' + messageId + ' Available callbacks: ' + Array.from(this.messageCallbacks.keys()).join(', '));
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    Log.Error('CppWasmWorker', 'Worker encountered an error:', {
      message: error.message,
      filename: error.filename,
      lineno: error.lineno,
      colno: error.colno,
      error: error.error
    });
    this.messageCallbacks.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error(error.message || 'C++ WASM Worker error'));
    });
    this.messageCallbacks.clear();
    this.isInitialized = false;
  }

  dispose(): void {
    if (this.worker) {
      Log.Info('CppWasmWorker', 'Terminating worker...');
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


