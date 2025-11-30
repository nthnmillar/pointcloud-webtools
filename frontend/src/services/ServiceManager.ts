import { BaseService } from './BaseService';
import { PointService } from './point/PointService';
import { SceneService } from './scene/SceneService';
import { CameraService } from './camera/CameraService';
import { RenderService } from './render/RenderService';
import { LoaderService } from './loader/LoaderService';
import { ToolsService } from './tools/ToolsService';
import type { PointCloudData, RenderOptions } from './point/PointCloud';
import { Log } from '../utils/Log';

/**
 * Service Manager - Coordinates all services and manages their lifecycle
 */
export class ServiceManager extends BaseService {
  private _pointService: PointService;
  private _sceneService: SceneService;
  private _cameraService: CameraService;
  private _renderService: RenderService;
  private _loaderService: LoaderService;
  private _toolsService: ToolsService;

  constructor() {
    super();

    // Initialize services
    this._pointService = new PointService();
    this._sceneService = new SceneService();
    this._cameraService = new CameraService();
    this._renderService = new RenderService();
    this._loaderService = new LoaderService(this);
    this._toolsService = new ToolsService(this);
  }

  /** Get the scene service */
  public get sceneService(): SceneService {
    return this._sceneService;
  }

  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    try {
      // Initialize services - ensure scene service is ready first
      await this._sceneService.initialize(canvas);
      
      // Get the scene
      const scene = this._sceneService.scene;
      
      // Initialize camera service with the scene
      if (scene) {
        await this._cameraService.initialize(scene, canvas);
        // Don't show frustum by default - let user choose
      }
      
      await Promise.all([
        this._renderService.initialize(),
        this._loaderService.initialize(),
        this._toolsService.initialize().catch(err => {
          Log.Error('ServiceManager', 'ToolsService initialization failed, continuing without it:', err);
          return null;
        }),
      ]);

      // Initialize point service with the scene and service manager
      if (scene) {
        await this._pointService.initialize(scene, this);
      }

      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to initialize services',
      });
      throw error;
    }
  }

  dispose(): void {
    // Dispose all services
    this._pointService.dispose();
    this._sceneService.dispose();
    this._renderService.dispose();
    this._loaderService.dispose();
    this._toolsService.dispose();

    this.removeAllObservers();
  }


  // Point Service Methods
  async loadPointCloud(id: string, data: PointCloudData, autoPositionCamera: boolean = true): Promise<void> {
    return this._pointService.loadPointCloud(id, data, autoPositionCamera);
  }

  generateSamplePointCloud(
    id: string,
    pointCount: number = 1000
  ): PointCloudData {
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
    
    // Emit event to notify components that scene was cleared via button
    this.emit('sceneClearedByUser', {});
  }

  // Service Access Methods (for advanced usage)
  get pointService(): PointService {
    return this._pointService;
  }

  get renderService(): RenderService {
    return this._renderService;
  }

  get cameraService(): CameraService {
    return this._cameraService;
  }

  // Convenience methods for UI
  get renderOptions(): RenderOptions {
    return this._renderService.renderOptions;
  }

  // Loader Service Methods
  async loadFile(file: File, batchSize: number = 500, batchLimit?: number): Promise<void> {
    // Loading file
    return this._loaderService.loadFile(file, batchSize, batchLimit);
  }

  cancelLoading(): void {
    this._loaderService.cancelLoading();
  }

  async getFileMetadata(file: File): Promise<unknown> {
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

  get toolsService(): ToolsService {
    return this._toolsService;
  }

  /**
   * Check if WebGL is ready
   */
  get isWebGLReady(): boolean {
    return this._sceneService.isWebGLReady;
  }
}
