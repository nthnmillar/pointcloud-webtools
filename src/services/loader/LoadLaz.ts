import { LoadLazWorker } from './LoadLazWorker';
import type { PointCloudData, PointCloudPoint } from '../point/pointCloud';

/**
 * Interface for LAZ loading progress
 */
export interface LazLoadingProgress {
  stage: 'initializing' | 'reading' | 'processing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  pointCount?: number;
}

/**
 * Interface for LAZ file metadata
 */
export interface LazFileMetadata {
  fileName: string;
  fileSize: number;
  pointCount: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  format: number;
  scale: {
    x: number;
    y: number;
    z: number;
  };
  offset: {
    x: number;
    y: number;
    z: number;
  };
}

/**
 * LoadLaz class for handling LAZ file loading operations
 * Manages file reading, processing, and conversion to PointCloudData format
 */
export class LoadLaz {
  private worker: LoadLazWorker;
  private isProcessing: boolean = false;

  constructor() {
    this.worker = new LoadLazWorker();
  }

  /**
   * Load a LAZ file from a File object
   * @param file - The LAZ file to load
   * @param onProgress - Optional callback for progress updates
   * @returns Promise with PointCloudData
   */
  async loadFromFile(
    file: File, 
    onProgress?: (progress: LazLoadingProgress) => void
  ): Promise<PointCloudData> {
    if (this.isProcessing) {
      throw new Error('Already processing a LAZ file');
    }

    this.isProcessing = true;

    try {
      // Stage 1: Initialize
      onProgress?.({
        stage: 'initializing',
        progress: 0,
        message: 'Initializing LAZ processor...'
      });

      // Stage 2: Read file
      onProgress?.({
        stage: 'reading',
        progress: 10,
        message: 'Reading LAZ file...'
      });

      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      
      // Stage 3: Process LAZ data
      onProgress?.({
        stage: 'processing',
        progress: 20,
        message: 'Processing LAZ data...'
      });

      const processedData = await this.worker.processLazFile(
        arrayBuffer,
        (progress) => {
          onProgress?.({
            stage: 'processing',
            progress: 20 + (progress * 0.7), // 20-90%
            message: `Processing points... ${Math.round(progress)}%`
          });
        }
      );

      // Stage 4: Convert to PointCloudData format
      const pointCloudData = this.convertToPointCloudData(
        file.name,
        processedData,
        arrayBuffer.byteLength
      );

      onProgress?.({
        stage: 'complete',
        progress: 100,
        message: 'LAZ file loaded successfully',
        pointCount: pointCloudData.points.length / 3
      });

      return pointCloudData;

    } catch (error) {
      onProgress?.({
        stage: 'error',
        progress: 0,
        message: `Error loading LAZ file: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Load a LAZ file from an ArrayBuffer
   * @param arrayBuffer - The LAZ file data
   * @param fileName - Name of the file
   * @param onProgress - Optional callback for progress updates
   * @returns Promise with PointCloudData
   */
  async loadFromArrayBuffer(
    arrayBuffer: ArrayBuffer,
    fileName: string,
    onProgress?: (progress: LazLoadingProgress) => void
  ): Promise<PointCloudData> {
    if (this.isProcessing) {
      throw new Error('Already processing a LAZ file');
    }

    this.isProcessing = true;

    try {
      // Stage 1: Initialize
      onProgress?.({
        stage: 'initializing',
        progress: 0,
        message: 'Initializing LAZ processor...'
      });

      // Stage 2: Process LAZ data
      onProgress?.({
        stage: 'processing',
        progress: 10,
        message: 'Processing LAZ data...'
      });

      const processedData = await this.worker.processLazFile(
        arrayBuffer,
        (progress) => {
          onProgress?.({
            stage: 'processing',
            progress: 10 + (progress * 0.8), // 10-90%
            message: `Processing points... ${Math.round(progress)}%`,
            pointCount: processedData?.pointCount
          });
        }
      );

      // Stage 3: Convert to PointCloudData format
      const pointCloudData = this.convertToPointCloudData(
        fileName,
        processedData,
        arrayBuffer.byteLength
      );

      onProgress?.({
        stage: 'complete',
        progress: 100,
        message: 'LAZ file loaded successfully',
        pointCount: pointCloudData.points.length / 3
      });

      return pointCloudData;

    } catch (error) {
      onProgress?.({
        stage: 'error',
        progress: 0,
        message: `Error loading LAZ file: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get metadata from a LAZ file without fully processing it
   * @param file - The LAZ file
   * @returns Promise with file metadata
   */
  async getMetadata(file: File): Promise<LazFileMetadata> {
    try {
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      
      // Create a temporary worker to get header info
      const tempWorker = new LoadLazWorker();
      await tempWorker.processLazFile(arrayBuffer);
      
      // We need to modify the worker to expose header info without processing all points
      // For now, we'll process a small sample to get metadata
      const sampleSize = Math.min(1000, arrayBuffer.byteLength);
      const sampleBuffer = arrayBuffer.slice(0, sampleSize);
      
      // This is a simplified approach - in a real implementation, you'd want to
      // read just the header without processing points
      const processedData = await tempWorker.processLazFile(sampleBuffer);
      
      tempWorker.dispose();
      
      return {
        fileName: file.name,
        fileSize: file.size,
        pointCount: processedData.pointCount,
        bounds: processedData.bounds,
        format: processedData.header.pointDataRecordFormat,
        scale: {
          x: processedData.header.scaleX,
          y: processedData.header.scaleY,
          z: processedData.header.scaleZ
        },
        offset: {
          x: processedData.header.offsetX,
          y: processedData.header.offsetY,
          z: processedData.header.offsetZ
        }
      };
    } catch (error) {
      throw new Error(`Failed to read LAZ metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if currently processing a file
   */
  get processing(): boolean {
    return this.isProcessing;
  }

  /**
   * Check if the worker is ready
   */
  get ready(): boolean {
    return this.worker.ready;
  }

  /**
   * Read a file as ArrayBuffer
   */
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as ArrayBuffer'));
        }
      };
      reader.onerror = () => reject(new Error('File reading failed'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Convert processed LAZ data to PointCloudData format
   */
  private convertToPointCloudData(
    fileName: string,
    processedData: {
      points: Float32Array;
      pointCount: number;
      bounds: any;
      header: any;
    },
    fileSize: number
  ): PointCloudData {
    // Convert Float32Array to PointCloudPoint array
    const pointCloudPoints: PointCloudPoint[] = [];
    for (let i = 0; i < processedData.pointCount; i++) {
      const pointIndex = i * 3;
      pointCloudPoints.push({
        position: {
          x: processedData.points[pointIndex],
          y: processedData.points[pointIndex + 1],
          z: processedData.points[pointIndex + 2]
        }
      });
    }

    console.log('Converting to PointCloudData:', {
      pointCount: processedData.pointCount,
      bounds: processedData.bounds,
      pointCloudPointsLength: pointCloudPoints.length,
      firstPoint: pointCloudPoints.length > 0 ? pointCloudPoints[0] : null
    });

    return {
      points: pointCloudPoints,
      metadata: {
        name: fileName.replace(/\.laz$/i, ''),
        totalPoints: processedData.pointCount,
        bounds: {
          min: {
            x: processedData.bounds.minX,
            y: processedData.bounds.minY,
            z: processedData.bounds.minZ
          },
          max: {
            x: processedData.bounds.maxX,
            y: processedData.bounds.maxY,
            z: processedData.bounds.maxZ
          }
        },
        hasColor: false,
        hasIntensity: false,
        hasClassification: false,
        coordinateSystem: 'local',
        units: 'meters', // Default, could be extracted from LAZ header
        created: new Date(),
        modified: new Date(),
        description: `LAZ file loaded from ${fileName}`,
        // Store additional LAZ-specific metadata
        source: 'laz',
        fileName,
        fileSize,
        format: processedData.header.pointDataRecordFormat,
        scale: {
          x: processedData.header.scaleX,
          y: processedData.header.scaleY,
          z: processedData.header.scaleZ
        },
        offset: {
          x: processedData.header.offsetX,
          y: processedData.header.offsetY,
          z: processedData.header.offsetZ
        }
      }
    };
  }

  /**
   * Dispose of the loader and clean up resources
   */
  dispose(): void {
    this.worker.dispose();
    this.isProcessing = false;
  }
}
