import { BaseService } from './BaseService';
import { PointService } from './point/PointService';
import { SceneService } from './scene/SceneService';
import { RenderService } from './render/RenderService';
import type { 
  PointCloudData, 
  RenderOptions 
} from './point/pointCloud';

/**
 * Service Manager - Coordinates all services and manages their lifecycle
 */
export class ServiceManager extends BaseService {
  private _pointService: PointService;
  private _sceneService: SceneService;
  private _renderService: RenderService;

  constructor() {
    super();
    
    // Initialize services
    this._pointService = new PointService();
    this._sceneService = new SceneService();
    this._renderService = new RenderService();

    // Set up service communication
    this.setupServiceCommunication();
  }

  async initialize(canvas: HTMLCanvasElement, ...args: any[]): Promise<void> {

    try {
      // Initialize services
      await Promise.all([
        this._sceneService.initialize(canvas),
        this._renderService.initialize()
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

    this._pointService.on('pointCloudRendered', (data) => {
      this.emit('pointCloudRendered', data);
    });

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
  private renderActivePointCloud(): void {
    this._renderService.renderActivePointCloud(this._pointService);
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

  // Convenience methods for UI
  get renderOptions(): RenderOptions {
    return this._renderService.renderOptions;
  }
}
