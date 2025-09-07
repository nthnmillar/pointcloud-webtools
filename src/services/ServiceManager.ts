import { BaseService } from './BaseService';
import { PointService } from './point/PointService';
import { RenderService } from './render/RenderService';
import type { 
  PointCloudData, 
  RenderOptions 
} from '../types/PointCloud';

/**
 * Service Manager - Coordinates all services and manages their lifecycle
 */
export class ServiceManager extends BaseService {
  private pointService: PointService;
  private renderService: RenderService;
  private _canvas: HTMLCanvasElement | null = null;

  constructor() {
    super();
    
    // Initialize services
    this.pointService = new PointService();
    this.renderService = new RenderService();

    // Set up service communication
    this.setupServiceCommunication();
  }

  async initialize(canvas: HTMLCanvasElement, ...args: any[]): Promise<void> {
    this._canvas = canvas;

    try {
      // Initialize all services
      await Promise.all([
        this.pointService.initialize(),
        this.renderService.initialize(canvas)
      ]);

      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', { error: error instanceof Error ? error.message : 'Failed to initialize services' });
      throw error;
    }
  }

  dispose(): void {
    // Dispose all services
    this.pointService.dispose();
    this.renderService.dispose();
    
    this.removeAllObservers();
  }

  /**
   * Set up communication between services
   */
  private setupServiceCommunication(): void {
    // Point service events
    this.pointService.on('loaded', (data) => {
      this.emit('pointCloudLoaded', data);
      this.renderActivePointCloud();
    });

    this.pointService.on('loading', (data) => {
      this.emit('pointCloudLoading', data);
    });

    this.pointService.on('error', (data) => {
      this.emit('pointCloudError', data);
    });

    this.pointService.on('selectionChanged', (data) => {
      this.emit('selectionChanged', data);
      this.renderActivePointCloud();
    });

    this.pointService.on('removed', (data) => {
      this.renderService.removePointCloud(data.id);
      this.emit('pointCloudRemoved', data);
    });

    // Render service events
    this.renderService.on('pointCloudRendered', (data) => {
      this.emit('pointCloudRendered', data);
    });
  }

  // Point Service Methods
  async loadPointCloud(id: string, data: PointCloudData): Promise<void> {
    return this.pointService.loadPointCloud(id, data);
  }

  generateSamplePointCloud(id: string, pointCount: number = 1000): PointCloudData {
    return this.pointService.generateSamplePointCloud(id, pointCount);
  }

  getPointCloud(id: string): PointCloudData | undefined {
    return this.pointService.getPointCloud(id);
  }

  getPointCloudIds(): string[] {
    return this.pointService.getPointCloudIds();
  }

  setActivePointCloud(id: string): void {
    this.pointService.setActivePointCloud(id);
  }

  getActivePointCloud(): PointCloudData | null {
    return this.pointService.getActivePointCloud();
  }

  getActivePointCloudId(): string | null {
    return this.pointService.getActivePointCloudId();
  }

  removePointCloud(id: string): void {
    this.pointService.removePointCloud(id);
  }


  // Render Service Methods
  updateRenderOptions(options: Partial<RenderOptions>): void {
    const currentOptions = this.getRenderOptions();
    const newOptions = { ...currentOptions, ...options };
    
    this.emit('renderOptionsChanged', newOptions);
    this.renderActivePointCloud();
  }

  getRenderOptions(): RenderOptions {
    // Default render options
    return {
      pointSize: 2.0,
      colorMode: 'original',
      showBoundingBox: false,
      showAxes: true,
      backgroundColor: { r: 0.1, g: 0.1, b: 0.1 }
    };
  }


  /**
   * Render the active point cloud
   */
  private renderActivePointCloud(): void {
    const activePointCloud = this.pointService.getActivePointCloud();
    const activeId = this.pointService.getActivePointCloudId();
    
    console.log('ServiceManager: renderActivePointCloud called', { 
      hasActivePointCloud: !!activePointCloud, 
      activeId,
      pointCount: activePointCloud?.points.length 
    });
    
    if (activePointCloud && activeId) {
      const renderOptions = this.getRenderOptions();
      this.renderService.renderPointCloud(activeId, activePointCloud, renderOptions);
    } else {
      console.warn('ServiceManager: No active point cloud to render');
    }
  }

  // Service Access Methods (for advanced usage)
  getPointService(): PointService {
    return this.pointService;
  }

  getRenderService(): RenderService {
    return this.renderService;
  }
}
