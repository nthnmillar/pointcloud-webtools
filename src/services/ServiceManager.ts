import { BaseService } from './BaseService';
import { PointService } from './point/PointService';
import { SceneService } from './scene/SceneService';
import { RenderService } from './render/RenderService';
import { LoaderService } from './loader/LoaderService';
import { CameraService } from './camera/CameraService';
import type { 
  PointCloudData, 
  RenderOptions 
} from './point/PointCloud';

/**
 * Service Manager - Coordinates all services and manages their lifecycle
 */
export class ServiceManager extends BaseService {
  private _pointService: PointService;
  private _sceneService: SceneService;
  private _renderService: RenderService;
  private _loaderService: LoaderService;

  constructor() {
    super();
    
    // Initialize services
    this._pointService = new PointService();
    this._sceneService = new SceneService();
    this._renderService = new RenderService();
    this._loaderService = new LoaderService(this);

    // Set up service communication
    this.setupServiceCommunication();
  }

  async initialize(canvas: HTMLCanvasElement): Promise<void> {

    try {
      // Initialize services
      await Promise.all([
        this._sceneService.initialize(canvas),
        this._renderService.initialize(),
        this._loaderService.initialize()
      ]);
      
      // Initialize point service with the scene
      const scene = this._sceneService.scene;
      if (!scene) {
        throw new Error('Failed to get scene from scene service');
      }
      await this._pointService.initialize(scene);

      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', { error: error instanceof Error ? error.message : 'Failed to initialize services' });
      throw error;
    }
  }

  dispose(): void {
    // Dispose all services
    this._pointService.dispose();
    this._sceneService.dispose();
    this._renderService.dispose();
    this._loaderService.dispose();
    
    this.removeAllObservers();
  }

  /**
   * Set up communication between services
   */
  private setupServiceCommunication(): void {
    // Point service events
    this._pointService.on('loaded', (data) => {
      this.emit('pointCloudLoaded', data);
      this.renderActivePointCloud();
    });

    this._pointService.on('loading', (data) => {
      this.emit('pointCloudLoading', data);
    });

    this._pointService.on('error', (data) => {
      this.emit('pointCloudError', data);
    });

    this._pointService.on('selectionChanged', (data) => {
      this.emit('selectionChanged', data);
      this.renderActivePointCloud();
    });

    this._pointService.on('removed', (data) => {
      this.emit('pointCloudRemoved', data);
    });

    // Point cloud rendering handled directly

    this._pointService.on('renderOptionsUpdated', (data) => {
      this.emit('renderOptionsUpdated', data);
    });

    // Render service events
    this._renderService.on('renderRequested', () => {
      this.renderActivePointCloud();
    });

    this._renderService.on('renderOptionsChanged', (data) => {
      this.emit('renderOptionsChanged', data);
    });

    // Loader service events
    this._loaderService.on('loadingStarted', (data: any) => {
      this.emit('fileLoadingStarted', data);
    });

    this._loaderService.on('loadingCompleted', (data: any) => {
      this.emit('fileLoadingCompleted', data);
      // Automatically load the point cloud data into the point service
      if (data.pointCloudData) {
        // Received point cloud data
        // Generate a unique ID for the loaded point cloud
        const id = `loaded_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.loadPointCloud(id, data.pointCloudData);
        // Set the newly loaded point cloud as active
        this.activePointCloudId = id;
        // Set active point cloud
        // Trigger rendering of the new point cloud
        this.renderActivePointCloud();
      }
    });

    this._loaderService.on('loadingError', (data: any) => {
      this.emit('fileLoadingError', data);
    });
  }

  // Point Service Methods
  async loadPointCloud(id: string, data: PointCloudData): Promise<void> {
    return this._pointService.loadPointCloud(id, data);
  }

  generateSamplePointCloud(id: string, pointCount: number = 1000): PointCloudData {
    return this._pointService.generateSamplePointCloud(id, pointCount);
  }

  getPointCloud(id: string): PointCloudData | undefined {
    return this._pointService.getPointCloud(id);
  }

  get pointCloudIds(): string[] {
    return this._pointService.pointCloudIds;
  }

  set activePointCloudId(id: string) {
    this._pointService.activePointCloudId = id;
  }

  get activePointCloud(): PointCloudData | null {
    return this._pointService.activePointCloud;
  }

  get activePointCloudId(): string | null {
    return this._pointService.activePointCloudId;
  }

  removePointCloud(id: string): void {
    this._pointService.removePointCloud(id);
  }


  /**
   * Render the active point cloud
   */
  renderActivePointCloud(): void {
    this._renderService.renderActivePointCloud(this._pointService);
  }

  /**
   * Clear all point clouds from the scene
   */
  clearAllPointClouds(): void {
    this._pointService.clearAllPointClouds();
    this._renderService.clearScene();
  }

  // Service Access Methods (for advanced usage)
  get pointService(): PointService {
    return this._pointService;
  }

  get sceneService(): SceneService {
    return this._sceneService;
  }

  get renderService(): RenderService {
    return this._renderService;
  }

  get cameraService(): CameraService {
    return this._sceneService.cameraService;
  }

  // Convenience methods for UI
  get renderOptions(): RenderOptions {
    return this._renderService.renderOptions;
  }

  // Loader Service Methods
  async loadFile(
    file: File, 
    batchSize: number = 500
  ): Promise<void> {
    // Loading file
    return this._loaderService.loadFile(file, batchSize);
  }

  cancelLoading(): void {
    this._loaderService.cancelLoading();
  }


  async getFileMetadata(file: File): Promise<any> {
    return this._loaderService.getFileMetadata(file);
  }

  isSupportedFormat(extension: string): boolean {
    return this._loaderService.isSupportedFormat(extension);
  }

  getSupportedFormats(): string[] {
    return this._loaderService.getSupportedFormats();
  }

  get isFileLoading(): boolean {
    return this._loaderService.isProcessing;
  }

  get isLoaderReady(): boolean {
    return this._loaderService.isReady;
  }

  // Service Access Methods (for advanced usage)
  get loaderService(): LoaderService {
    return this._loaderService;
  }
}
