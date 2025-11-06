import type { PointCloudData, PointCloudPoint } from '../point/PointCloud';
import { ServiceManager } from '../ServiceManager';
import { Log } from '../../utils/Log';
// COPC WASM module will be loaded dynamically from /wasm/copc_loader.js

export interface COPCLoadingProgress {
  stage: 'initializing' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
}

export class LoadCOPC {
  private module: any = null;
  private loader: any = null;
  private isProcessing = false;
  private serviceManager: ServiceManager;
  private currentFileId: string | null = null;
  private headerData: any = null;
  private calculatedCentroid: { x: number; y: number; z: number } | null = null;
  private totalPointsProcessed: number = 0;

  constructor(serviceManager: ServiceManager) {
    this.serviceManager = serviceManager;
  }

  get ready(): boolean {
    return this.module !== null && this.loader !== null;
  }

  get processing(): boolean {
    return this.isProcessing;
  }

  private resetAccumulator(): void {
    this.currentFileId = null;
    this.headerData = null;
    this.calculatedCentroid = null;
    this.totalPointsProcessed = 0;
  }

  /**
   * Cancel the current loading process
   */
  cancelLoading(): void {
    if (this.isProcessing && this.loader) {
      this.loader.clear();
      this.isProcessing = false;
      this.resetAccumulator();
    }
  }

  async loadFromFile(file: File, batchSize: number = 500, batchLimit?: number): Promise<void> {
    // Cancel any existing loading process
    if (this.isProcessing) {
      Log.Info('LoadCOPC', 'Cancelling previous loading process');
      this.cancelLoading();
    }

    this.isProcessing = true;
    this.resetAccumulator();
    this.currentFileId = `copc_${Date.now()}`;

    try {
      // Initialize WASM module
      await this.initializeModule();

      // Process file
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      await this.processFile(arrayBuffer, batchSize, batchLimit);
    } catch (error) {
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  private async initializeModule(): Promise<void> {
    if (this.module) return;

    try {
      // Load laz-perf for real point decompression
      const lazPerfModule = await import('laz-perf');
      const createLazPerf = lazPerfModule.createLazPerf;
      
      // Initialize laz-perf
      const lazPerf = await createLazPerf({
        locateFile: (path: string) =>
          path.endsWith('.wasm') ? '/wasm/laz-perf.wasm' : path,
      });

      // Load COPC WASM module
      const response = await fetch('/wasm/copc_loader.js');
      const jsCode = await response.text();

      // Create a module function
      const moduleFunction = new Function('module', 'exports', jsCode);

      // Create module object
      const module = { exports: {} };
      moduleFunction(module, module.exports);

      // Get the COPCModule function
      const COPCModule = (module.exports as { default?: (options?: { locateFile?: (path: string) => string }) => Promise<any> }).default || module.exports as (options?: { locateFile?: (path: string) => string }) => Promise<any>;

      if (typeof COPCModule !== 'function') {
        throw new Error('COPCModule is not a function: ' + typeof COPCModule);
      }

      // Initialize the module
      this.module = await COPCModule({
        locateFile: (path: string) => {
          if (path.endsWith('.wasm')) {
            return '/wasm/copc_loader.wasm';
          }
          return path;
        }
      });
      
      // Create a new loader instance with laz-perf
      this.loader = new this.module.COPCLoader();
      this.loader.setLazPerf(lazPerf); // Pass laz-perf to the loader
      
      Log.Info('LoadCOPC', 'COPC WASM module initialized with laz-perf');
    } catch (error) {
      Log.Error('LoadCOPC', 'Failed to initialize COPC WASM module', error);
      throw error;
    }
  }

  private async processFile(
    fileBuffer: ArrayBuffer,
    batchSize: number = 500,
    batchLimit?: number
  ): Promise<void> {
    if (!this.loader) throw new Error('COPC loader not initialized');

    try {
      // Load the COPC file
      const success = this.loader.loadFromArrayBuffer(fileBuffer);
      if (!success) {
        throw new Error('Failed to load COPC file');
      }

      // Get header information
      this.headerData = this.loader.getHeader();
      Log.Info('LoadCOPC', 'COPC file loaded', {
        pointCount: this.headerData.pointCount,
        bounds: this.loader.getBounds(),
        hasColor: this.headerData.hasColor,
        hasIntensity: this.headerData.hasIntensity,
        hasClassification: this.headerData.hasClassification
      });

      // Calculate centroid for centering
      this.calculateCentroid();

      // Process points in batches
      await this.processPointsInBatches(batchSize, batchLimit);

    } catch (error) {
      Log.Error('LoadCOPC', 'Error processing COPC file', error);
      throw error;
    }
  }

  private calculateCentroid(): void {
    if (!this.headerData) return;

    // Use bounds to calculate centroid
    this.calculatedCentroid = {
      x: (this.headerData.minX + this.headerData.maxX) / 2,
      y: (this.headerData.minY + this.headerData.maxY) / 2,
      z: (this.headerData.minZ + this.headerData.maxZ) / 2,
    };

    Log.Info('LoadCOPC', `Point cloud centroid: (${this.calculatedCentroid.x.toFixed(2)}, ${this.calculatedCentroid.y.toFixed(2)}, ${this.calculatedCentroid.z.toFixed(2)})`);
  }

  private async processPointsInBatches(batchSize: number, batchLimit?: number): Promise<void> {
    if (!this.loader || !this.calculatedCentroid) return;

    const allPoints = this.loader.getAllPoints();
    const totalPoints = allPoints.length;
    const totalBatches = Math.ceil(totalPoints / batchSize);
    const maxBatches = batchLimit !== undefined && batchLimit > 0 ? Math.min(batchLimit, totalBatches) : totalBatches;

    Log.Info('LoadCOPC', `Processing ${totalPoints} points in ${maxBatches} batches${batchLimit ? ` (limited from ${totalBatches} total)` : ''}`);

    for (let i = 0; i < maxBatches; i++) {
      const startIndex = i * batchSize;
      const endIndex = Math.min(startIndex + batchSize, totalPoints);
      const batchPoints = allPoints.slice(startIndex, endIndex);

      // Convert to PointCloudPoint format
      const pointCloudPoints = this.convertToPointCloudPoints(batchPoints);

      // Create batch mesh
      this.createBatchMesh(pointCloudPoints, i + 1);

      // Small delay to prevent blocking the UI
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    if (batchLimit && maxBatches < totalBatches) {
      Log.Info('LoadCOPC', `Stopped at batch limit of ${batchLimit}. Processed ${this.totalPointsProcessed} points in ${maxBatches} batches`);
    } else {
      Log.Info('LoadCOPC', `Completed processing ${this.totalPointsProcessed} points in ${maxBatches} batches`);
    }
  }

  private convertToPointCloudPoints(points: any[]): PointCloudPoint[] {
    const pointCloudPoints: PointCloudPoint[] = new Array(points.length);

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      pointCloudPoints[i] = {
        position: {
          x: point.x - this.calculatedCentroid!.x, // Center around origin
          y: point.y - this.calculatedCentroid!.y,
          z: point.z - this.calculatedCentroid!.z,
        },
        color: this.headerData.hasColor ? {
          r: point.r,
          g: point.g,
          b: point.b,
        } : undefined,
        intensity: this.headerData.hasIntensity ? point.intensity : undefined,
        classification: this.headerData.hasClassification ? point.classification : undefined,
      };
    }

    return pointCloudPoints;
  }

  private createBatchMesh(points: PointCloudPoint[], batchNumber: number): void {
    if (points.length === 0) return;

    const batchId = `${this.currentFileId}_batch_${batchNumber}`;
    this.totalPointsProcessed += points.length;
    
    Log.Info('LoadCOPC', `Creating batch: ${batchId} (${points.length} points, ${this.totalPointsProcessed} total processed)`);

    const pointCloudData: PointCloudData = {
      points: points,
      metadata: {
        name: batchId,
        totalPoints: points.length,
        bounds: { 
          min: { x: 0, y: 0, z: 0 }, 
          max: { x: 0, y: 0, z: 0 } 
        }, // Dummy bounds
        hasColor: this.headerData.hasColor,
        hasIntensity: this.headerData.hasIntensity,
        hasClassification: this.headerData.hasClassification,
        centroid: this.calculatedCentroid!,
      },
    };

    // Create the batch mesh
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
