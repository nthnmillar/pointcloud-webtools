import { BaseService } from '../BaseService';
import { LoadLaz } from './LoadLaz';
import type { PointCloudData } from '../point/PointCloud';
import type { LazLoadingProgress, LazFileMetadata } from './LoadLaz';

/**
 * Interface for loader events
 */
export interface LoaderEventData {
  type: 'laz' | 'las' | 'ply' | 'xyz';
  fileName: string;
  progress?: LazLoadingProgress;
  pointCloudData?: PointCloudData;
  metadata?: LazFileMetadata;
  error?: string;
}

/**
 * LoaderService - Manages loading of various point cloud file formats
 * Currently supports LAZ files, with extensibility for other formats
 */
export class LoaderService extends BaseService {
  private loadLaz: LoadLaz;
  private supportedFormats: string[] = ['.laz', '.las'];

  constructor() {
    super();
    this.loadLaz = new LoadLaz();
  }

  async initialize(...args: any[]): Promise<void> {
    // Initialize the LAZ loader
    // The LoadLaz class initializes its worker asynchronously
    this.isInitialized = true;
    this.emit('initialized');
  }

  dispose(): void {
    this.loadLaz.dispose();
    this.removeAllObservers();
  }

  /**
   * Load a point cloud file
   * @param file - The file to load
   * @param onProgress - Optional progress callback
   * @returns Promise with PointCloudData
   */
  async loadFile(
    file: File, 
    onProgress?: (progress: LazLoadingProgress) => void
  ): Promise<PointCloudData> {
    if (!this.isInitialized) {
      throw new Error('LoaderService not initialized');
    }

    const fileExtension = this.getFileExtension(file.name);
    
    if (!this.isSupportedFormat(fileExtension)) {
      throw new Error(`Unsupported file format: ${fileExtension}. Supported formats: ${this.supportedFormats.join(', ')}`);
    }

    try {
      this.emit('loadingStarted', {
        type: this.getFileType(fileExtension),
        fileName: file.name
      } as LoaderEventData);

      let pointCloudData: PointCloudData;

      switch (fileExtension) {
        case '.laz':
        case '.las':
          pointCloudData = await this.loadLazFile(file, onProgress);
          break;
        default:
          throw new Error(`File type ${fileExtension} not yet implemented`);
      }

      this.emit('loadingCompleted', {
        type: this.getFileType(fileExtension),
        fileName: file.name,
        pointCloudData
      } as LoaderEventData);

      return pointCloudData;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      this.emit('loadingError', {
        type: this.getFileType(fileExtension),
        fileName: file.name,
        error: errorMessage
      } as LoaderEventData);

      throw error;
    }
  }

  /**
   * Load a LAZ file from ArrayBuffer
   * @param arrayBuffer - The file data
   * @param fileName - Name of the file
   * @param onProgress - Optional progress callback
   * @returns Promise with PointCloudData
   */
  async loadLazFromArrayBuffer(
    arrayBuffer: ArrayBuffer,
    fileName: string,
    onProgress?: (progress: LazLoadingProgress) => void
  ): Promise<PointCloudData> {
    if (!this.isInitialized) {
      throw new Error('LoaderService not initialized');
    }

    try {
      this.emit('loadingStarted', {
        type: 'laz',
        fileName
      } as LoaderEventData);

      const pointCloudData = await this.loadLaz.loadFromArrayBuffer(
        arrayBuffer, 
        fileName, 
        onProgress
      );

      this.emit('loadingCompleted', {
        type: 'laz',
        fileName,
        pointCloudData
      } as LoaderEventData);

      return pointCloudData;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      this.emit('loadingError', {
        type: 'laz',
        fileName,
        error: errorMessage
      } as LoaderEventData);

      throw error;
    }
  }

  /**
   * Get metadata for a file without fully loading it
   * @param file - The file to inspect
   * @returns Promise with file metadata
   */
  async getFileMetadata(file: File): Promise<LazFileMetadata> {
    if (!this.isInitialized) {
      throw new Error('LoaderService not initialized');
    }

    const fileExtension = this.getFileExtension(file.name);
    
    if (!this.isSupportedFormat(fileExtension)) {
      throw new Error(`Unsupported file format: ${fileExtension}. Supported formats: ${this.supportedFormats.join(', ')}`);
    }

    try {
      switch (fileExtension) {
        case '.laz':
        case '.las':
          return await this.loadLaz.getMetadata(file);
        default:
          throw new Error(`Metadata extraction for ${fileExtension} not yet implemented`);
      }
    } catch (error) {
      throw new Error(`Failed to get file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a file format is supported
   * @param extension - File extension (with or without dot)
   * @returns True if supported
   */
  isSupportedFormat(extension: string): boolean {
    const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
    return this.supportedFormats.includes(normalizedExtension.toLowerCase());
  }

  /**
   * Get list of supported file formats
   * @returns Array of supported extensions
   */
  getSupportedFormats(): string[] {
    return [...this.supportedFormats];
  }

  /**
   * Check if currently processing any files
   * @returns True if processing
   */
  get isProcessing(): boolean {
    return this.loadLaz.processing;
  }

  /**
   * Check if the loader is ready
   * @returns True if ready
   */
  get isReady(): boolean {
    return this.isInitialized && this.loadLaz.ready;
  }

  /**
   * Load a LAZ file using the LoadLaz class
   */
  private async loadLazFile(
    file: File, 
    onProgress?: (progress: LazLoadingProgress) => void
  ): Promise<PointCloudData> {
    return await this.loadLaz.loadFromFile(file, onProgress);
  }

  /**
   * Extract file extension from filename
   */
  private getFileExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return '';
    }
    return fileName.substring(lastDotIndex).toLowerCase();
  }

  /**
   * Get file type from extension
   */
  private getFileType(extension: string): 'laz' | 'las' | 'ply' | 'xyz' {
    const normalizedExtension = extension.toLowerCase();
    
    if (normalizedExtension === '.laz') return 'laz';
    if (normalizedExtension === '.las') return 'las';
    if (normalizedExtension === '.ply') return 'ply';
    if (normalizedExtension === '.xyz') return 'xyz';
    
    throw new Error(`Unknown file type: ${extension}`);
  }
}
