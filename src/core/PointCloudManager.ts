import { Observable } from './Observable';
import type { 
  PointCloudData, 
  PointCloudMetadata, 
  PointCloudPoint, 
  PointCloudEvent, 
  RenderOptions,
  CameraSettings,
  Point3D
} from '../types/PointCloud';

/**
 * Point Cloud Manager - Observable OOP class for managing point cloud data
 */
export class PointCloudManager extends Observable<PointCloudEvent> {
  private pointClouds: Map<string, PointCloudData> = new Map();
  private activePointCloudId: string | null = null;
  private renderOptions: RenderOptions;
  private cameraSettings: CameraSettings;

  constructor() {
    super();
    this.renderOptions = this.getDefaultRenderOptions();
    this.cameraSettings = this.getDefaultCameraSettings();
  }

  /**
   * Load point cloud data
   */
  async loadPointCloud(id: string, data: PointCloudData): Promise<void> {
    this.emit('loading', { type: 'loading', data: { id }, timestamp: new Date() });
    
    try {
      // Validate data
      this.validatePointCloudData(data);
      
      // Store the point cloud
      this.pointClouds.set(id, data);
      
      // Set as active if it's the first one
      if (!this.activePointCloudId) {
        this.setActivePointCloud(id);
      }
      
      this.emit('loaded', { 
        type: 'loaded', 
        data: { id, metadata: data.metadata }, 
        timestamp: new Date() 
      });
    } catch (error) {
      this.emit('error', { 
        type: 'error', 
        data: { id, error: error instanceof Error ? error.message : 'Unknown error' }, 
        timestamp: new Date() 
      });
      throw error;
    }
  }

  /**
   * Generate sample point cloud data for testing
   */
  generateSamplePointCloud(id: string, pointCount: number = 1000): PointCloudData {
    const points: PointCloudPoint[] = [];
    
    for (let i = 0; i < pointCount; i++) {
      points.push({
        position: {
          x: (Math.random() - 0.5) * 100,
          y: (Math.random() - 0.5) * 100,
          z: (Math.random() - 0.5) * 100
        },
        color: {
          r: Math.random(),
          g: Math.random(),
          b: Math.random()
        },
        intensity: Math.random(),
        classification: Math.floor(Math.random() * 10)
      });
    }

    const metadata: PointCloudMetadata = {
      name: `Sample Point Cloud ${id}`,
      description: 'Generated sample data for testing',
      totalPoints: pointCount,
      bounds: this.calculateBounds(points),
      hasColor: true,
      hasIntensity: true,
      hasClassification: true,
      coordinateSystem: 'local',
      units: 'meters',
      created: new Date()
    };

    return { points, metadata };
  }

  /**
   * Get point cloud by ID
   */
  getPointCloud(id: string): PointCloudData | undefined {
    return this.pointClouds.get(id);
  }

  /**
   * Get all point cloud IDs
   */
  getPointCloudIds(): string[] {
    return Array.from(this.pointClouds.keys());
  }

  /**
   * Set active point cloud
   */
  setActivePointCloud(id: string): void {
    if (!this.pointClouds.has(id)) {
      throw new Error(`Point cloud with ID ${id} not found`);
    }
    
    this.activePointCloudId = id;
    this.emit('selectionChanged', { 
      type: 'selectionChanged', 
      data: { activeId: id }, 
      timestamp: new Date() 
    });
  }

  /**
   * Get active point cloud
   */
  getActivePointCloud(): PointCloudData | null {
    if (!this.activePointCloudId) return null;
    return this.pointClouds.get(this.activePointCloudId) || null;
  }

  /**
   * Get active point cloud ID
   */
  getActivePointCloudId(): string | null {
    return this.activePointCloudId;
  }

  /**
   * Remove point cloud
   */
  removePointCloud(id: string): void {
    if (this.pointClouds.has(id)) {
      this.pointClouds.delete(id);
      
      if (this.activePointCloudId === id) {
        this.activePointCloudId = this.pointClouds.size > 0 ? 
          Array.from(this.pointClouds.keys())[0] : null;
      }
    }
  }

  /**
   * Update render options
   */
  updateRenderOptions(options: Partial<RenderOptions>): void {
    this.renderOptions = { ...this.renderOptions, ...options };
    this.emit('renderOptionsChanged', { 
      type: 'renderOptionsChanged', 
      data: this.renderOptions, 
      timestamp: new Date() 
    });
  }

  /**
   * Get current render options
   */
  getRenderOptions(): RenderOptions {
    return { ...this.renderOptions };
  }

  /**
   * Update camera settings
   */
  updateCameraSettings(settings: Partial<CameraSettings>): void {
    this.cameraSettings = { ...this.cameraSettings, ...settings };
    this.emit('cameraChanged', { 
      type: 'cameraChanged', 
      data: this.cameraSettings, 
      timestamp: new Date() 
    });
  }

  /**
   * Get current camera settings
   */
  getCameraSettings(): CameraSettings {
    return { ...this.cameraSettings };
  }

  /**
   * Calculate bounding box for points
   */
  private calculateBounds(points: PointCloudPoint[]): { min: Point3D; max: Point3D } {
    if (points.length === 0) {
      return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    }

    let minX = points[0].position.x, maxX = points[0].position.x;
    let minY = points[0].position.y, maxY = points[0].position.y;
    let minZ = points[0].position.z, maxZ = points[0].position.z;

    for (const point of points) {
      minX = Math.min(minX, point.position.x);
      maxX = Math.max(maxX, point.position.x);
      minY = Math.min(minY, point.position.y);
      maxY = Math.max(maxY, point.position.y);
      minZ = Math.min(minZ, point.position.z);
      maxZ = Math.max(maxZ, point.position.z);
    }

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    };
  }

  /**
   * Validate point cloud data
   */
  private validatePointCloudData(data: PointCloudData): void {
    if (!data.points || !Array.isArray(data.points)) {
      throw new Error('Invalid point cloud data: points must be an array');
    }

    if (!data.metadata) {
      throw new Error('Invalid point cloud data: metadata is required');
    }

    if (data.points.length === 0) {
      throw new Error('Point cloud cannot be empty');
    }

    // Validate each point
    for (let i = 0; i < data.points.length; i++) {
      const point = data.points[i];
      if (!point.position || 
          typeof point.position.x !== 'number' ||
          typeof point.position.y !== 'number' ||
          typeof point.position.z !== 'number') {
        throw new Error(`Invalid point at index ${i}: position must have x, y, z numbers`);
      }
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

  /**
   * Get default camera settings
   */
  private getDefaultCameraSettings(): CameraSettings {
    return {
      position: { x: 50, y: 50, z: 50 },
      target: { x: 0, y: 0, z: 0 },
      fov: 0.8,
      near: 0.1,
      far: 1000
    };
  }
}
