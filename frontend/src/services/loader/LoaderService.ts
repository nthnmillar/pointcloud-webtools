import { BaseService } from '../BaseService';
import { LoadLaz } from './LoadLaz';
import { LoadCOPC } from './LoadCOPC';

export interface LazLoadingProgress {
  stage: 'initializing' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
}

export class LoaderService extends BaseService {
  private loadLaz: LoadLaz;
  private loadCOPC: LoadCOPC;

  constructor(serviceManager: any) {
    super();
    this.loadLaz = new LoadLaz(serviceManager);
    this.loadCOPC = new LoadCOPC(serviceManager);
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  get isReady(): boolean {
    return this.isInitialized && this.loadLaz.ready && this.loadCOPC.ready;
  }

  get isProcessing(): boolean {
    return this.loadLaz.processing || this.loadCOPC.processing;
  }

  cancelLoading(): void {
    this.loadLaz.cancelLoading();
    this.loadCOPC.cancelLoading();
  }

  async loadFile(file: File, batchSize: number = 500): Promise<void> {
    const fileExtension = file.name
      .toLowerCase()
      .substring(file.name.lastIndexOf('.'));

    if (!['.laz', '.las', '.copc', '.copc.laz'].includes(fileExtension)) {
      throw new Error(`Unsupported file format: ${fileExtension}`);
    }

    try {
      this.emit('loadingStarted', {
        type: (fileExtension === '.copc' || fileExtension === '.copc.laz') ? 'COPC' : 'LAZ',
        fileName: file.name,
      });

      if (fileExtension === '.copc' || fileExtension === '.copc.laz') {
        // Load COPC file
        await this.loadCOPC.loadFromFile(file, batchSize);
      } else {
        // Load LAZ file
        await this.loadLaz.loadFromFile(file, batchSize);
      }

      this.emit('loadingCompleted', {
        type: (fileExtension === '.copc' || fileExtension === '.copc.laz') ? 'COPC' : 'LAZ',
        fileName: file.name,
        pointCloudData: null, // Batches are handled individually
      });
    } catch (error) {
      this.emit('loadingError', {
        type: (fileExtension === '.copc' || fileExtension === '.copc.laz') ? 'COPC' : 'LAZ',
        fileName: file.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  isSupportedFormat(extension: string): boolean {
    return ['.laz', '.las', '.copc', '.copc.laz'].includes(extension.toLowerCase());
  }

  getSupportedFormats(): string[] {
    return ['.laz', '.las', '.copc', '.copc.laz'];
  }

  async getFileMetadata(file: File): Promise<any> {
    // For now, just return basic file info
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    };
  }

  dispose(): void {
    // Cleanup if needed
  }
}
