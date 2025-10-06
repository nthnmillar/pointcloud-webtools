import { BaseService } from "../../BaseService";
import { Log } from "../../../utils/Log";
import type { ServiceManager } from '../../ServiceManager';
import { VoxelDownsamplingWASMCPP } from './VoxelDownsamplingWASMCPP';
import { VoxelDownsamplingTS } from './VoxelDownsamplingTS';
import { VoxelDownsamplingBECPP } from './VoxelDownsamplingBECPP';
import { VoxelDownsampleDebug } from './VoxelDownsampleDebug';

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
  
  public voxelDownsamplingWASMCPP: VoxelDownsamplingWASMCPP;
  public voxelDownsamplingTS: VoxelDownsamplingTS;
  public voxelDownsamplingBECPP: VoxelDownsamplingBECPP;
  public voxelDownsampleDebug: VoxelDownsampleDebug | null = null;

  constructor(serviceManager: ServiceManager) {
    super();
    this.voxelDownsamplingWASMCPP = new VoxelDownsamplingWASMCPP(serviceManager);
    this.voxelDownsamplingTS = new VoxelDownsamplingTS(serviceManager);
    this.voxelDownsamplingBECPP = new VoxelDownsamplingBECPP(serviceManager);
    
    // Initialize debug visualization after a short delay to ensure scene is ready
    setTimeout(() => {
      if (serviceManager.sceneService?.scene) {
        this.voxelDownsampleDebug = new VoxelDownsampleDebug(serviceManager.sceneService.scene, serviceManager);
      } else {
        Log.WarnClass(this, 'Scene not available for voxel debug initialization');
      }
    }, 100);
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    try {
      Log.InfoClass(this, 'Creating worker...');
      
      // Create worker from the VoxelDownsampleWorker.ts file
      this.worker = new Worker(
        new URL('./VoxelDownsampleWorker.ts', import.meta.url),
        { type: 'module' }
      );

      Log.InfoClass(this, 'Worker created, setting up event handlers...');

      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);

      // Initialize the worker
      Log.InfoClass(this, 'Sending INITIALIZE message to worker...');
      this.worker.postMessage({ type: 'INITIALIZE' });

      // Wait for initialization
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          Log.ErrorClass(this, 'Worker initialization timeout');
          reject(new Error('Worker initialization timeout'));
        }, 10000);

        const handleInit = (event: MessageEvent) => {
          Log.DebugClass(this, 'Received message from worker', event.data);
          
          if (event.data.type === 'WORKER_INITIALIZED') {
            clearTimeout(timeout);
            this.worker?.removeEventListener('message', handleInit);
            this._isInitialized = true;
            Log.InfoClass(this, 'Worker initialization completed successfully');
            resolve();
          } else if (event.data.type === 'ERROR') {
            clearTimeout(timeout);
            this.worker?.removeEventListener('message', handleInit);
            Log.ErrorClass(this, 'Worker reported error during initialization', event.data.data.error);
            reject(new Error(event.data.data.error));
          }
        };

        this.worker?.addEventListener('message', handleInit);
      });

      // Initialize WASM module
      Log.InfoClass(this, 'Initializing WASM module...');
      await this.voxelDownsamplingWASMCPP.initialize();
      Log.InfoClass(this, 'WASM module initialized successfully');

      Log.InfoClass(this, 'Worker initialized successfully');
    } catch (error) {
      Log.ErrorClass(this, 'Failed to initialize worker', error);
      Log.ErrorClass(this, 'Error details', error);
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
        Log.ErrorClass(this, 'Worker error', data.error);
        this.emit('error', { error: data.error });
        break;

      default:
        Log.WarnClass(this, 'Unknown message type', type);
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    Log.ErrorClass(this, 'Worker error', error);
    Log.ErrorClass(this, 'Error details', {
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
    Log.ErrorClass(this, `Batch ${batchId} failed`, error);
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

  showVoxelDebug(voxelSize?: number): void {
    this.emit('debugUpdate', { showVoxels: true, voxelSize });
  }

  hideVoxelDebug(): void {
    this.emit('debugUpdate', { showVoxels: false });
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
