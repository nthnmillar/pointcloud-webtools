import type { PointCloudData, PointCloudPoint } from '../point/PointCloud';
import { ServiceManager } from '../ServiceManager';
import { Log } from '../../utils/Log';

export interface LazLoadingProgress {
  stage: 'initializing' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
}

// LAS header data structure (from las-header module)
export interface LasHeaderData {
  CenterX?: number;
  CenterY?: number;
  CenterZ?: number;
  MinX?: number;
  MaxX?: number;
  MinY?: number;
  MaxY?: number;
  MinZ?: number;
  MaxZ?: number;
  ScaleFactorX?: number;
  ScaleFactorY?: number;
  ScaleFactorZ?: number;
  OffsetX?: number;
  OffsetY?: number;
  OffsetZ?: number;
  [key: string]: unknown;
}

// Batch data structure from LazWorker (optional attributes when present in file)
export interface LazBatchData {
  batchId: string;
  points: Float32Array;
  progress: number;
  totalBatches: number;
  header?: LasHeaderData;
  hasColor?: boolean;
  hasIntensity?: boolean;
  hasClassification?: boolean;
  colors?: Float32Array;
  intensities?: Uint16Array;
  classifications?: Uint8Array;
}

export class LoadLaz {
  private worker: Worker | null = null;
  private isProcessing = false;
  private serviceManager: ServiceManager;
  private currentFileId: string | null = null;
  private batchCount: number = 0;
  private headerData: LasHeaderData | null = null;
  private calculatedCentroid: { x: number; y: number; z: number } | null = null;
  private totalPointsProcessed: number = 0;
  private currentMessageHandler: ((e: MessageEvent) => void) | null = null;

  constructor(serviceManager: ServiceManager) {
    this.serviceManager = serviceManager;
  }

  get ready(): boolean {
    return this.worker !== null;
  }

  get processing(): boolean {
    return this.isProcessing;
  }

  private batchLimit: number | undefined = undefined;

  private resetAccumulator(): void {
    this.currentFileId = null;
    this.batchCount = 0;
    this.headerData = null;
    this.calculatedCentroid = null;
    this.totalPointsProcessed = 0;
    this.currentMessageHandler = null;
    this.batchLimit = undefined;
  }

  /**
   * Cancel the current loading process
   */
  cancelLoading(): void {
    if (this.isProcessing && this.worker && this.currentMessageHandler) {
      // Remove the message handler to stop processing new batches
      this.worker.removeEventListener('message', this.currentMessageHandler);
      this.currentMessageHandler = null;

      // Reset processing state
      this.isProcessing = false;
      this.resetAccumulator();
    }
  }

  async loadFromFile(
    file: File,
    batchSize: number = 500,
    batchLimit?: number
  ): Promise<void> {
    // Cancel any existing loading process
    if (this.isProcessing) {
      Log.Info('LoadLaz', 'Cancelling previous loading process');
      this.cancelLoading();
    }

    this.isProcessing = true;
    this.resetAccumulator(); // Reset the accumulator
    this.batchLimit = batchLimit; // Store batch limit
    this.currentFileId = `laz_${Date.now()}`; // Generate unique file ID

    try {
      // Initialize worker
      await this.initializeWorker();

      // Process file with batches
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      await this.processFile(arrayBuffer, batchSize);
    } finally {
      this.isProcessing = false;
    }
  }

  private async initializeWorker(): Promise<void> {
    if (this.worker) return;

    return new Promise((resolve, reject) => {
      this.worker = new Worker(new URL('./LazWorker.ts', import.meta.url), {
        type: 'module',
      });

      const initHandler = (e: MessageEvent) => {
        if (e.data.type === 'INIT_COMPLETE') {
          this.worker!.removeEventListener('message', initHandler);
          resolve();
        }
      };

      this.worker.addEventListener('message', initHandler);

      this.worker.onerror = error => {
        this.worker!.removeEventListener('message', initHandler);
        reject(error);
      };

      this.worker.postMessage({ type: 'INIT' });
    });
  }

  private async processFile(
    fileBuffer: ArrayBuffer,
    batchSize: number = 500
  ): Promise<void> {
    if (!this.worker) throw new Error('Worker not initialized');

    return new Promise((resolve, reject) => {
      const handleMessage = (e: MessageEvent) => {
        const { type, data } = e.data;

        switch (type) {
          case 'FILE_INITIALIZED':
            // File is initialized, log total points
            // Start processing batches
            this.processNextBatch();
            break;

          case 'BATCH_COMPLETE':
            // Process this batch immediately
            this.processBatch(data);
            // Check if we've reached the batch limit
            if (
              this.batchLimit !== undefined &&
              this.batchCount >= this.batchLimit
            ) {
              Log.Info(
                'LoadLaz',
                `Reached batch limit of ${this.batchLimit}, stopping loading`
              );
              this.worker!.removeEventListener('message', handleMessage);
              this.currentMessageHandler = null;
              this.isProcessing = false;
              resolve();
              return;
            }
            // Request next batch
            this.processNextBatch();
            break;

          case 'PROCESSING_COMPLETE':
            this.worker!.removeEventListener('message', handleMessage);
            this.currentMessageHandler = null;
            // All batch meshes are now visible, forming the complete point cloud
            this.resetAccumulator(); // Reset the accumulator after processing completes
            resolve();
            break;

          case 'ERROR':
            this.worker!.removeEventListener('message', handleMessage);
            this.currentMessageHandler = null;
            reject(new Error(data.error));
            break;
        }
      };

      // Store the message handler so it can be removed when cancelled
      this.currentMessageHandler = handleMessage;
      this.worker!.addEventListener('message', handleMessage);
      this.worker!.postMessage({
        type: 'INITIALIZE_FILE',
        data: { fileBuffer, batchSize },
      });
    });
  }

  private processNextBatch(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'PROCESS_NEXT_BATCH' });
    }
  }

  private processBatch(batchData: LazBatchData): void {
    if (!batchData.points || batchData.points.length === 0) {
      return;
    }

    // Store header data for centering (from first batch)
    if (batchData.header && !this.headerData) {
      this.headerData = batchData.header;
    }

    // Create individual batch mesh immediately - pass full batch (points + optional attributes)
    this.createBatchMesh(batchData);

    this.batchCount++;
  }

  private createBatchMesh(batchData: LazBatchData): void {
    const points = batchData.points;
    if (!points || points.length === 0) {
      return;
    }

    // Calculate centroid only once from header data
    let centroid = { x: 0, y: 0, z: 0 };
    if (this.headerData && !this.calculatedCentroid) {
      // Use the actual centroid from header data if available, otherwise calculate from bounds
      if (
        this.headerData.CenterX !== undefined &&
        this.headerData.CenterY !== undefined &&
        this.headerData.CenterZ !== undefined
      ) {
        centroid = {
          x: this.headerData.CenterX,
          y: this.headerData.CenterY,
          z: this.headerData.CenterZ,
        };
      } else {
        // Fallback to calculating from min/max bounds
        if (
          this.headerData.MinX !== undefined &&
          this.headerData.MaxX !== undefined &&
          this.headerData.MinY !== undefined &&
          this.headerData.MaxY !== undefined &&
          this.headerData.MinZ !== undefined &&
          this.headerData.MaxZ !== undefined
        ) {
          centroid = {
            x: (this.headerData.MinX + this.headerData.MaxX) / 2,
            y: (this.headerData.MinY + this.headerData.MaxY) / 2,
            z: (this.headerData.MinZ + this.headerData.MaxZ) / 2,
          };
        }
      }
      this.calculatedCentroid = centroid;
      Log.Info(
        'LoadLaz',
        `Point cloud centroid: (${centroid.x.toFixed(2)}, ${centroid.y.toFixed(2)}, ${centroid.z.toFixed(2)})`
      );
    } else if (this.calculatedCentroid) {
      centroid = this.calculatedCentroid;
    }

    // Convert raw points to PointCloudPoint array more efficiently
    const pointCount = points.length / 3;
    const pointCloudPoints: PointCloudPoint[] = new Array(pointCount);

    const hasColor = batchData.hasColor === true && batchData.colors != null;
    const hasIntensity = batchData.hasIntensity === true && batchData.intensities != null;
    const hasClassification =
      batchData.hasClassification === true && batchData.classifications != null;

    // Pre-allocate objects and set optional attributes only when present
    for (let i = 0; i < pointCount; i++) {
      const arrayIndex = i * 3;
      const pt: PointCloudPoint = {
        position: {
          x: points[arrayIndex] - centroid.x,
          y: points[arrayIndex + 1] - centroid.y,
          z: points[arrayIndex + 2] - centroid.z,
        },
      };
      if (hasColor) {
        pt.color = {
          r: batchData.colors![i * 3],
          g: batchData.colors![i * 3 + 1],
          b: batchData.colors![i * 3 + 2],
        };
      }
      if (hasIntensity) {
        pt.intensity = batchData.intensities![i];
      }
      if (hasClassification) {
        pt.classification = batchData.classifications![i];
      }
      pointCloudPoints[i] = pt;
    }

    const batchId = `${this.currentFileId}_batch_${this.batchCount + 1}`;
    this.totalPointsProcessed += pointCount;
    Log.Info(
      'LoadLaz',
      `Creating batch: ${batchId} (${pointCount} points, ${this.totalPointsProcessed} total processed)`
    );

    const pointCloudData: PointCloudData = {
      points: pointCloudPoints,
      metadata: {
        name: batchId,
        totalPoints: pointCount,
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
        hasColor,
        hasIntensity,
        hasClassification,
        centroid: centroid,
      },
    };

    // Create the batch mesh immediately
    this.serviceManager.pointService.createPointCloudMesh(
      batchId,
      pointCloudData
    );
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
