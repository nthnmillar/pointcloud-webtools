import { BaseService } from '../../BaseService';

export interface VoxelBatchData {
  batchId: string;
  points: Float32Array;
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

export interface VoxelBatchResult {
  batchId: string;
  downsampledPoints: Float32Array;
  originalCount: number;
  downsampledCount: number;
  processingTime: number;
  success: boolean;
  error?: string;
}

export class VoxelDownsampleService extends BaseService {
  private worker: Worker | null = null;
  private _isInitialized = false;
  private isProcessing = false;
  private pendingBatches = new Map<string, (result: VoxelBatchResult) => void>();

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    try {
      console.log('VoxelDownsampleService: Creating worker...');
      
      // Create worker from the VoxelDownsampleWorker.ts file
      this.worker = new Worker(
        new URL('./VoxelDownsampleWorker.ts', import.meta.url),
        { type: 'module' }
      );

      console.log('VoxelDownsampleService: Worker created, setting up event handlers...');

      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);

      // Initialize the worker
      console.log('VoxelDownsampleService: Sending INITIALIZE message to worker...');
      this.worker.postMessage({ type: 'INITIALIZE' });

      // Wait for initialization
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error('VoxelDownsampleService: Worker initialization timeout');
          reject(new Error('Worker initialization timeout'));
        }, 10000);

        const handleInit = (event: MessageEvent) => {
          console.log('VoxelDownsampleService: Received message from worker:', event.data);
          
          if (event.data.type === 'WORKER_INITIALIZED') {
            clearTimeout(timeout);
            this.worker?.removeEventListener('message', handleInit);
            this._isInitialized = true;
            console.log('VoxelDownsampleService: Worker initialization completed successfully');
            resolve();
          } else if (event.data.type === 'ERROR') {
            clearTimeout(timeout);
            this.worker?.removeEventListener('message', handleInit);
            console.error('VoxelDownsampleService: Worker reported error during initialization:', event.data.data.error);
            reject(new Error(event.data.data.error));
          }
        };

        this.worker?.addEventListener('message', handleInit);
      });

      console.log('VoxelDownsampleService: Worker initialized successfully');
    } catch (error) {
      console.error('VoxelDownsampleService: Failed to initialize worker:', error);
      console.error('VoxelDownsampleService: Error details:', error);
      throw error;
    }
  }

  private handleWorkerMessage(event: MessageEvent): void {
    const { type, data } = event.data;

    switch (type) {
      case 'BATCH_COMPLETE':
        this.handleBatchComplete(data);
        break;

      case 'BATCH_ERROR':
        this.handleBatchError(data);
        break;

      case 'ERROR':
        console.error('VoxelDownsampleService: Worker error:', data.error);
        this.emit('error', { error: data.error });
        break;

      default:
        console.warn('VoxelDownsampleService: Unknown message type:', type);
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    console.error('VoxelDownsampleService: Worker error:', error);
    console.error('VoxelDownsampleService: Error details:', {
      message: error.message,
      filename: error.filename,
      lineno: error.lineno,
      colno: error.colno,
      type: error.type,
      target: error.target
    });
    this.emit('error', { error: error.message });
  }

  private handleBatchComplete(data: VoxelBatchResult): void {
    const { batchId } = data;
    const callback = this.pendingBatches.get(batchId);
    
    if (callback) {
      callback(data);
      this.pendingBatches.delete(batchId);
    }

    this.emit('batchComplete', data);
  }

  private handleBatchError(data: VoxelBatchResult): void {
    const { batchId, error } = data;
    const callback = this.pendingBatches.get(batchId);
    
    if (callback) {
      callback(data);
      this.pendingBatches.delete(batchId);
    }

    this.emit('batchError', data);
    console.error(`VoxelDownsampleService: Batch ${batchId} failed:`, error);
  }

  async processBatch(batchData: VoxelBatchData): Promise<VoxelBatchResult> {
    if (!this._isInitialized || !this.worker) {
      throw new Error('Worker not initialized');
    }

    this.isProcessing = true;

    return new Promise<VoxelBatchResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingBatches.delete(batchData.batchId);
        reject(new Error(`Batch ${batchData.batchId} processing timeout`));
      }, 30000); // 30 second timeout

      this.pendingBatches.set(batchData.batchId, (result) => {
        clearTimeout(timeout);
        this.isProcessing = false;
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error || 'Batch processing failed'));
        }
      });

      this.worker!.postMessage({
        type: 'PROCESS_BATCH',
        data: batchData
      });
    });
  }

  get ready(): boolean {
    return this._isInitialized;
  }

  get processing(): boolean {
    return this.isProcessing;
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this._isInitialized = false;
    this.isProcessing = false;
    this.pendingBatches.clear();
  }
}
