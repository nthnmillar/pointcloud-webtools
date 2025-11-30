import { BaseService } from '../BaseService';
import type { RenderOptions } from '../point/PointCloud';

/**
 * Render Service - Handles rendering operations and render options
 */
export class RenderService extends BaseService {
  private _renderOptions: RenderOptions;

  constructor() {
    super();
    this._renderOptions = this.getDefaultRenderOptions();
  }

  async initialize(): Promise<void> {
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
    // Note: Re-render is handled manually by the UI to avoid double rendering
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
  renderActivePointCloud(pointService: {
    activePointCloudId: string | null;
    renderPointCloud(id: string, options: RenderOptions): void;
  }): void {
    const activeId = pointService.activePointCloudId;

    if (activeId) {
      pointService.renderPointCloud(activeId, this._renderOptions);
    }
  }

  /**
   * Clear the scene (remove all rendered content)
   */
  clearScene(): void {
    // This is a placeholder - in a real implementation, this would clear the 3D scene
    // For now, we just emit an event that the scene has been cleared
    this.emit('sceneCleared');
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
      backgroundColor: { r: 0.1, g: 0.1, b: 0.1 },
    };
  }
}
