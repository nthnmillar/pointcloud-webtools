import { BaseService } from '../BaseService';
import { LoadLaz } from './LoadLaz';
import type { PointCloudData } from '../point/PointCloud';

export interface LazLoadingProgress {
  stage: 'initializing' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
}

export class LoaderService extends BaseService {
  private loadLaz: LoadLaz;

  constructor(serviceManager: any) {
    super();
    this.loadLaz = new LoadLaz(serviceManager);
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  get isReady(): boolean {
    return this.isInitialized && this.loadLaz.ready;
  }

  get isProcessing(): boolean {
    return this.loadLaz.processing;
  }

  async loadFile(
    file: File, 
    onProgress?: (progress: LazLoadingProgress) => void
  ): Promise<PointCloudData> {
    console.log('LoaderService: loadFile called with', file.name);
    
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    console.log('LoaderService: File extension:', fileExtension);
    
    if (!['.laz', '.las'].includes(fileExtension)) {
      throw new Error(`Unsupported file format: ${fileExtension}`);
    }

    try {
      this.emit('loadingStarted', {
        type: 'LAZ',
        fileName: file.name,
      });

      console.log('LoaderService: Delegating to LoadLaz');
      const result = await this.loadLaz.loadFromFile(file, onProgress);

      this.emit('loadingCompleted', {
        type: 'LAZ',
        fileName: file.name,
        pointCloudData: result,
      });

      return result;
    } catch (error) {
      this.emit('loadingError', {
        type: 'LAZ',
        fileName: file.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  isSupportedFormat(extension: string): boolean {
    return ['.laz', '.las'].includes(extension.toLowerCase());
  }

  getSupportedFormats(): string[] {
    return ['.laz', '.las'];
  }

  async getFileMetadata(file: File): Promise<any> {
    // For now, just return basic file info
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    };
  }

  dispose(): void {
    // Cleanup if needed
  }
}