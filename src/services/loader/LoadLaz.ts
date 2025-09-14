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
  private calculatedCentroid: { x: number; y: number; z: number } | null = null;
  private totalPointsProcessed: number = 0;

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
    this.calculatedCentroid = null;
    this.totalPointsProcessed = 0;
  }

  async loadFromFile(
    file: File,
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
      await this.initializeWorker();

      // Process file with batches
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      await this.processFile(arrayBuffer, batchSize);

    } catch (error) {
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

  private async processFile(fileBuffer: ArrayBuffer, batchSize: number = 500): Promise<void> {
    if (!this.worker) throw new Error('Worker not initialized');

    return new Promise((resolve, reject) => {
      const handleMessage = (e: MessageEvent) => {
        const { type, data } = e.data;

        switch (type) {
          case 'FILE_INITIALIZED':
            // File is initialized, log total points
            console.log(`Total points in file: ${data.pointCount}`);
            // Start processing batches
            this.processNextBatch();
            break;

          case 'BATCH_COMPLETE':
            // Process this batch immediately
            this.processBatch(data);
            // Request next batch
            this.processNextBatch();
            break;

          case 'PROCESSING_COMPLETE':
            this.worker!.removeEventListener('message', handleMessage);
            // All batch meshes are now visible, forming the complete point cloud
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
      this.worker!.postMessage({ type: 'INITIALIZE_FILE', data: { fileBuffer, batchSize } });
    });
  }

  private processNextBatch(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'PROCESS_NEXT_BATCH' });
    }
  }

  private processBatch(batchData: any): void {
    if (!batchData.points || batchData.points.length === 0) {
      return;
    }
    
    // Store header data for centering (from first batch)
    if (batchData.header && !this.headerData) {
      this.headerData = batchData.header;
    }

    // Create individual batch mesh immediately - pass raw points array
    this.createBatchMesh(batchData.points);
    
    this.batchCount++;
  }

  private createBatchMesh(points: Float32Array): void {
    if (points.length === 0) {
      return;
    }

    // Calculate centroid only once from header data
    let centroid = { x: 0, y: 0, z: 0 };
    if (this.headerData && !this.calculatedCentroid) {
      centroid = {
        x: (this.headerData.MinX + this.headerData.MaxX) / 2,
        y: (this.headerData.MinY + this.headerData.MaxY) / 2,
        z: (this.headerData.MinZ + this.headerData.MaxZ) / 2
      };
      this.calculatedCentroid = centroid;
    } else if (this.calculatedCentroid) {
      centroid = this.calculatedCentroid;
    }

    // Convert raw points to PointCloudPoint array more efficiently
    const pointCount = points.length / 3;
    const pointCloudPoints: PointCloudPoint[] = new Array(pointCount);
    
    // Pre-allocate objects to reduce garbage collection
    for (let i = 0; i < pointCount; i++) {
      const arrayIndex = i * 3;
      pointCloudPoints[i] = {
        position: {
          x: points[arrayIndex],
          y: points[arrayIndex + 1],
          z: points[arrayIndex + 2]
        }
      };
    }

    // Create individual batch mesh with unique ID
    const batchId = `${this.currentFileId}_batch_${this.batchCount + 1}`;
    this.totalPointsProcessed += pointCount;
    console.log(`Creating batch: ${batchId} (${pointCount} points, ${this.totalPointsProcessed} total processed)`);
    
    const pointCloudData: PointCloudData = {
      points: pointCloudPoints,
      metadata: {
        name: batchId,
        totalPoints: pointCount,
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }, // Dummy bounds
        hasColor: false,
        hasIntensity: false,
        hasClassification: false,
        centroid: centroid
      }
    };

    // Create the batch mesh immediately
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