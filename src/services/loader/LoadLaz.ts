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

  constructor(serviceManager: ServiceManager) {
    this.serviceManager = serviceManager;
  }

  get ready(): boolean {
    return this.worker !== null;
  }

  get processing(): boolean {
    return this.isProcessing;
  }

  async loadFromFile(
    file: File,
    onProgress?: (progress: LazLoadingProgress) => void
  ): Promise<PointCloudData> {
    if (this.isProcessing) {
      throw new Error('Already processing a LAZ file');
    }

    this.isProcessing = true;

    try {
      // Initialize worker
      onProgress?.({
        stage: 'initializing',
        progress: 10,
        message: 'Initializing LAZ processor...'
      });

      await this.initializeWorker();

      // Process file
      onProgress?.({
        stage: 'processing',
        progress: 50,
        message: 'Processing LAZ data...'
      });

      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      const result = await this.processFile(arrayBuffer, onProgress);

      // Create point cloud
      const pointCloudData = this.createPointCloudData(file.name, result);

      // Send to PointService
      console.log('LoadLaz: Loading point cloud with', pointCloudData.points.length, 'points');
      await this.serviceManager.pointService.loadPointCloud(file.name, pointCloudData);

      // Trigger rendering
      console.log('LoadLaz: Triggering rendering for', file.name);
      this.serviceManager.renderService.renderActivePointCloud(this.serviceManager.pointService);

      onProgress?.({
        stage: 'complete',
        progress: 100,
        message: 'LAZ file loaded successfully'
      });

      return pointCloudData;

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
      
      this.worker.onmessage = (e) => {
        if (e.data.type === 'INIT_COMPLETE') {
          resolve();
        }
      };
      
      this.worker.onerror = (error) => {
        reject(error);
      };
      
      this.worker.postMessage({ type: 'INIT' });
    });
  }

  private async processFile(fileBuffer: ArrayBuffer, onProgress?: (progress: LazLoadingProgress) => void): Promise<any> {
    if (!this.worker) throw new Error('Worker not initialized');

    return new Promise((resolve, reject) => {
      const handleMessage = (e: MessageEvent) => {
        if (e.data.type === 'RESULT') {
          this.worker!.removeEventListener('message', handleMessage);
          resolve(e.data.data);
        } else if (e.data.type === 'ERROR') {
          this.worker!.removeEventListener('message', handleMessage);
          reject(new Error(e.data.error));
        } else if (e.data.type === 'PROGRESS') {
          onProgress?.({
            stage: 'processing',
            progress: 20 + (e.data.progress * 0.8),
            message: `Processing points... ${Math.round(e.data.progress)}%`
          });
        }
      };

      this.worker!.addEventListener('message', handleMessage);
      this.worker!.postMessage({ type: 'PROCESS', data: { fileBuffer } });
    });
  }

  private async readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('File reading failed'));
      reader.readAsArrayBuffer(file);
    });
  }

  private createPointCloudData(fileName: string, result: any): PointCloudData {
    // Convert Float32Array to PointCloudPoint array
    const points: PointCloudPoint[] = [];
    for (let i = 0; i < result.pointCount; i++) {
      const pointIndex = i * 3;
      points.push({
        position: {
          x: result.points[pointIndex],
          y: result.points[pointIndex + 1],
          z: result.points[pointIndex + 2]
        }
      });
    }

    console.log('LoadLaz: Created point cloud data:');
    console.log('- Points:', points.length);
    console.log('- Bounds:', result.bounds);
    console.log('- First few points:', points.slice(0, 3).map(p => p.position));

    return {
      points,
      metadata: {
        name: fileName,
        totalPoints: result.pointCount,
        bounds: result.bounds,
        hasColor: false,
        hasIntensity: false,
        hasClassification: false,
        ...result.header
      }
    };
  }
}