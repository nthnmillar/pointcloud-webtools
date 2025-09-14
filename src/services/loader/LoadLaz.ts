import type { PointCloudData, PointCloudPoint } from '../point/PointCloud';
import { ServiceManager } from '../ServiceManager';

export interface LazLoadingProgress {
  stage: 'initializing' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
}

export class LoadLaz {
  private worker: Worker | null = null;
  private isProcessing = false;
  private serviceManager: ServiceManager;
  private currentFileId: string | null = null;
  private batchCount: number = 0;
  private headerData: any = null;

  constructor(serviceManager: ServiceManager) {
    this.serviceManager = serviceManager;
  }

  get ready(): boolean {
    return this.worker !== null;
  }

  get processing(): boolean {
    return this.isProcessing;
  }

  private resetAccumulator(): void {
    this.currentFileId = null;
    this.batchCount = 0;
    this.headerData = null;
  }

  async loadFromFile(
    file: File,
    onProgress?: (progress: LazLoadingProgress) => void,
    batchSize: number = 500
  ): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Already processing a LAZ file');
    }

    this.isProcessing = true;
    this.resetAccumulator(); // Reset the accumulator
    this.currentFileId = `laz_${Date.now()}`; // Generate unique file ID

    try {
      // Initialize worker
      onProgress?.({
        stage: 'initializing',
        progress: 10,
        message: 'Initializing LAZ processor...'
      });

      await this.initializeWorker();

      // Process file with batches
      onProgress?.({
        stage: 'processing',
        progress: 20,
        message: 'Processing LAZ data in batches...'
      });

      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      await this.processFile(arrayBuffer, onProgress, batchSize);

      onProgress?.({
        stage: 'complete',
        progress: 100,
        message: 'LAZ file loaded successfully'
      });

    } catch (error) {
      onProgress?.({
        stage: 'error',
        progress: 0,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  private async initializeWorker(): Promise<void> {
    if (this.worker) return;

    return new Promise((resolve, reject) => {
      this.worker = new Worker(new URL('./LazWorker.ts', import.meta.url), { type: 'module' });
      
      const initHandler = (e: MessageEvent) => {
        if (e.data.type === 'INIT_COMPLETE') {
          this.worker!.removeEventListener('message', initHandler);
          resolve();
        }
      };
      
      this.worker.addEventListener('message', initHandler);
      
      this.worker.onerror = (error) => {
        this.worker!.removeEventListener('message', initHandler);
        reject(error);
      };
      
      this.worker.postMessage({ type: 'INIT' });
    });
  }

  private async processFile(fileBuffer: ArrayBuffer, onProgress?: (progress: LazLoadingProgress) => void, batchSize: number = 500): Promise<void> {
    if (!this.worker) throw new Error('Worker not initialized');

    return new Promise((resolve, reject) => {
      const handleMessage = (e: MessageEvent) => {
        const { type, data } = e.data;

        switch (type) {
          case 'BATCH_COMPLETE':
            // Process this batch immediately
            this.processBatch(data);
            
            // Update progress
            onProgress?.({
              stage: 'processing',
              progress: 20 + (data.progress * 0.8),
              message: `Processing LAZ data... ${Math.round(data.progress)}%`
            });
            break;

          case 'PROGRESS':
            onProgress?.({
              stage: 'processing',
              progress: 20 + (e.data.progress * 0.8),
              message: `Processing LAZ data... ${Math.round(e.data.progress)}%`
            });
            break;

          case 'PROCESSING_COMPLETE':
            this.worker!.removeEventListener('message', handleMessage);
            // All batch meshes are now visible, forming the complete point cloud
            console.log(`LoadLaz: All ${this.batchCount} batches loaded successfully`);
            this.resetAccumulator(); // Reset the accumulator after processing completes
            resolve();
            break;

          case 'ERROR':
            this.worker!.removeEventListener('message', handleMessage);
            reject(new Error(data.error));
            break;
        }
      };

      this.worker!.addEventListener('message', handleMessage);
      this.worker!.postMessage({ type: 'PROCESS_BATCH', data: { fileBuffer, batchSize } });
    });
  }

  private processBatch(batchData: any): void {
    if (!batchData.points || batchData.points.length === 0) {
      return;
    }
    
    // Convert batch points to PointCloudPoint array
    const points: PointCloudPoint[] = [];
    for (let i = 0; i < batchData.points.length; i += 3) {
      points.push({
        position: {
          x: batchData.points[i],
          y: batchData.points[i + 1],
          z: batchData.points[i + 2]
        }
      });
    }

    // Store header data for centering (from first batch)
    if (batchData.header && !this.headerData) {
      this.headerData = batchData.header;
    }

    // Create individual batch mesh immediately
    this.createBatchMesh(points, batchData.bounds);
    
    this.batchCount++;
  }

  private createBatchMesh(points: PointCloudPoint[], bounds: any): void {
    if (points.length === 0) {
      return;
    }

    // Don't center individual batches - they should maintain their relative positions
    // Only center the final unified mesh at the end
    const batchPoints = points;

    // Create individual batch mesh with unique ID
    const batchId = `${this.currentFileId}_batch_${this.batchCount + 1}`;
    const pointCloudData: PointCloudData = {
      points: batchPoints,
      metadata: {
        name: batchId,
        totalPoints: batchPoints.length,
        bounds: bounds,
        hasColor: false,
        hasIntensity: false,
        hasClassification: false
      }
    };

    // Create the batch mesh immediately
    console.log(`LoadLaz: Creating batch mesh ${batchId} with ${points.length} points`);
    this.serviceManager.pointService.createPointCloudMesh(batchId, pointCloudData);
  }



  private async readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('File reading failed'));
      reader.readAsArrayBuffer(file);
    });
  }

}