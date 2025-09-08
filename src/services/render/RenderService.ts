import { BaseService } from '../BaseService';
import type { RenderOptions } from '../../types/PointCloud';

/**
 * Render Service - Handles rendering operations and render options
 */
export class RenderService extends BaseService {
  private _renderOptions: RenderOptions;

  constructor() {
    super();
    this._renderOptions = this.getDefaultRenderOptions();
  }

  async initialize(...args: any[]): Promise<void> {
    this.isInitialized = true;
    this.emit('initialized');
  }

  dispose(): void {
    this.removeAllObservers();
  }

  /**
   * Update render options
   */
  set renderOptions(options: Partial<RenderOptions>) {
    this._renderOptions = { ...this._renderOptions, ...options };
    this.emit('renderOptionsChanged', this._renderOptions);
    // Trigger re-render when options change
    this.emit('renderRequested');
  }

  /**
   * Get current render options
   */
  get renderOptions(): RenderOptions {
    return { ...this._renderOptions };
  }

  /**
   * Render the active point cloud (called by ServiceManager)
   */
  renderActivePointCloud(pointService: { activePointCloudId: string | null; renderPointCloud(id: string, options: RenderOptions): void }): void {
    const activeId = pointService.activePointCloudId;
    
    console.log('RenderService: renderActivePointCloud called', { 
      activeId
    });
    
    if (activeId) {
      pointService.renderPointCloud(activeId, this._renderOptions);
    } else {
      console.warn('RenderService: No active point cloud to render');
    }
  }

  /**
   * Get default render options
   */
  private getDefaultRenderOptions(): RenderOptions {
    return {
      pointSize: 2.0,
      colorMode: 'original',
      showBoundingBox: false,
      showAxes: true,
      backgroundColor: { r: 0.1, g: 0.1, b: 0.1 }
    };
  }
}