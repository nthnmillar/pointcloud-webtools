import { BaseService } from '../BaseService';
import { PointMesh } from './PointMesh';
import type {
  PointCloudData,
  PointCloudMetadata,
  PointCloudPoint,
  Point3D,
  RenderOptions,
} from './PointCloud';
import { Log } from '../../utils/Log';

/**
 * Point Service - Handles point cloud data operations
 */
export class PointService extends BaseService {
  private pointClouds: Map<string, PointCloudData> = new Map();
  private _activePointCloudId: string | null = null;
  private pointMesh: PointMesh | null = null;
  private scene: any = null;

  async initialize(scene: any): Promise<void> {
    this.scene = scene;
    this.pointMesh = new PointMesh(scene);
    this.isInitialized = true;
    this.emit('initialized');
  }

  dispose(): void {
    if (this.pointMesh) {
      this.pointMesh.dispose();
    }
    this.pointClouds.clear();
    this._activePointCloudId = null;
    this.removeAllObservers();
  }

  /**
   * Load point cloud data
   */
  async loadPointCloud(id: string, data: PointCloudData): Promise<void> {
    this.emit('loading', { id });

    try {
      this.validatePointCloudData(data);

      this.pointClouds.set(id, data);

      if (!this.activePointCloudId) {
        this.activePointCloudId = id;
      }

      // Render the point cloud
      this.renderPointCloud(id, this.getRenderOptions());

      this.emit('loaded', { id, metadata: data.metadata });
    } catch (error) {
      this.emit('error', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generate sample point cloud data
   */
  generateSamplePointCloud(
    id: string,
    pointCount: number = 1000
  ): PointCloudData {
    const points: PointCloudPoint[] = [];
    Log.InfoClass(this, 'Generating sample point cloud', { id, pointCount });

    // Generate some visible test points in a smaller, more visible area
    for (let i = 0; i < pointCount; i++) {
      points.push({
        position: {
          x: (Math.random() - 0.5) * 20, // Smaller range for better visibility
          y: (Math.random() - 0.5) * 20,
          z: (Math.random() - 0.5) * 20,
        },
        color: {
          r: Math.random(),
          g: Math.random(),
          b: Math.random(),
        },
        intensity: Math.random(),
        classification: Math.floor(Math.random() * 10),
      });
    }

    // Add some guaranteed visible points at known positions
    points.push(
      {
        position: { x: 0, y: 0, z: 0 },
        color: { r: 1, g: 0, b: 0 },
        intensity: 1,
        classification: 0,
      },
      {
        position: { x: 5, y: 0, z: 0 },
        color: { r: 0, g: 1, b: 0 },
        intensity: 1,
        classification: 1,
      },
      {
        position: { x: 0, y: 5, z: 0 },
        color: { r: 0, g: 0, b: 1 },
        intensity: 1,
        classification: 2,
      },
      {
        position: { x: 0, y: 0, z: 5 },
        color: { r: 1, g: 1, b: 0 },
        intensity: 1,
        classification: 3,
      }
    );

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
      created: new Date(),
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
  get pointCloudIds(): string[] {
    return Array.from(this.pointClouds.keys());
  }

  /**
   * Set active point cloud
   */
  set activePointCloudId(id: string) {
    if (!this.pointClouds.has(id)) {
      throw new Error(`Point cloud with ID ${id} not found`);
    }

    this._activePointCloudId = id;
    this.emit('selectionChanged', { activeId: id });
  }

  /**
   * Get active point cloud
   */
  get activePointCloud(): PointCloudData | null {
    if (!this._activePointCloudId) return null;
    return this.pointClouds.get(this._activePointCloudId) || null;
  }

  /**
   * Get active point cloud ID
   */
  get activePointCloudId(): string | null {
    return this._activePointCloudId;
  }

  /**
   * Get point mesh instance
   */
  get pointMeshInstance(): PointMesh | null {
    return this.pointMesh;
  }

  /**
   * Remove point cloud
   */
  removePointCloud(id: string): void {
    if (this.pointClouds.has(id)) {
      this.pointClouds.delete(id);

      // Clean up the mesh
      if (this.pointMesh) {
        this.pointMesh.removeMesh(id);
      }

      if (this._activePointCloudId === id) {
        this._activePointCloudId =
          this.pointClouds.size > 0
            ? Array.from(this.pointClouds.keys())[0]
            : null;
      }

      this.emit('removed', { id });
    }
  }

  /**
   * Clear all point clouds
   */
  clearAllPointClouds(): void {
    // Clean up all meshes
    if (this.pointMesh) {
      this.pointMesh.dispose();
      // Recreate the pointMesh for future use
      this.pointMesh = new PointMesh(this.scene);
    }

    // Clear the point clouds map
    this.pointClouds.clear();
    this._activePointCloudId = null;

    this.emit('cleared', {});
  }

  /**
   * Create point cloud mesh directly (bypasses loadPointCloud)
   */
  createPointCloudMesh(id: string, data: PointCloudData): void {
    try {
      Log.InfoClass(this, 'Creating point cloud', { id });

      this.validatePointCloudData(data);

      // Store the point cloud data
      this.pointClouds.set(id, data);

      // Point cloud created

      if (!this.activePointCloudId) {
        this.activePointCloudId = id;
      }

      // Create the mesh directly - don't call renderPointCloud to avoid duplication
      if (this.pointMesh) {
        this.pointMesh.createPointCloudMesh(id, data, this.getRenderOptions());
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Render a point cloud
   */
  renderPointCloud(id: string, options: RenderOptions): void {
    Log.InfoClass(this, 'Rendering point cloud', { id, hasPointCloud: !!this.pointClouds.get(id), hasPointMesh: !!this.pointMesh, scene: !!this.scene });

    const pointCloud = this.pointClouds.get(id);
    if (!pointCloud || !this.pointMesh) {
      Log.WarnClass(this, 'Cannot render point cloud - missing data or mesh', { id, hasPointCloud: !!pointCloud, hasPointMesh: !!this.pointMesh });
      return;
    }

    // Create the mesh directly
    this.pointMesh.createPointCloudMesh(id, pointCloud, options);
  }

  /**
   * Get current render options (placeholder - should get from RenderService)
   */
  private getRenderOptions(): RenderOptions {
    return {
      pointSize: 2.0,
      colorMode: 'original',
      showBoundingBox: false,
      showAxes: true,
      backgroundColor: { r: 0.1, g: 0.1, b: 0.1 },
    };
  }

  /**
   * Update render options for a point cloud (updates existing mesh)
   */
  updateRenderOptions(id: string, options: Partial<RenderOptions>): void {
    // Update point size if provided
    if (options.pointSize !== undefined && this.pointMesh) {
      this.pointMesh.updatePointSize(id, options.pointSize);
    }

    // Re-render with new options if other properties changed
    if (Object.keys(options).some(key => key !== 'pointSize')) {
      this.renderPointCloud(id, { ...this.getRenderOptions(), ...options });
    }

    this.emit('renderOptionsUpdated', { id, options });
  }

  /**
   * Calculate bounding box for points
   */
  public calculateBounds(points: PointCloudPoint[]): {
    min: Point3D;
    max: Point3D;
  } {
    if (points.length === 0) {
      return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    }

    let minX = points[0].position.x,
      maxX = points[0].position.x;
    let minY = points[0].position.y,
      maxY = points[0].position.y;
    let minZ = points[0].position.z,
      maxZ = points[0].position.z;

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
      max: { x: maxX, y: maxY, z: maxZ },
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
      if (
        !point.position ||
        typeof point.position.x !== 'number' ||
        typeof point.position.y !== 'number' ||
        typeof point.position.z !== 'number'
      ) {
        throw new Error(
          `Invalid point at index ${i}: position must have x, y, z numbers`
        );
      }
    }
  }
}
