import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  Color3,
  Color4,
  StandardMaterial,
  Mesh,
  VertexData
} from '@babylonjs/core';
import { BaseService } from '../BaseService';
import type { 
  PointCloudData, 
  RenderOptions 
} from '../../types/PointCloud';

/**
 * Render Service - Handles Babylon.js rendering operations
 */
export class RenderService extends BaseService {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private pointCloudMeshes: Map<string, Mesh> = new Map();

  async initialize(canvas: HTMLCanvasElement, ...args: any[]): Promise<void> {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true);
    this.scene = new Scene(this.engine);
    
    this.setupScene();
    this.setupCamera();
    this.setupLighting();
    this.startRenderLoop();
    
    this.isInitialized = true;
    this.emit('initialized');
  }

  dispose(): void {
    if (this.engine) {
      this.engine.dispose();
    }
    if (this.scene) {
      this.scene.dispose();
    }
    this.pointCloudMeshes.clear();
    this.removeAllObservers();
  }

  /**
   * Initialize the scene
   */
  private setupScene(): void {
    if (!this.scene) return;
    
    this.scene.clearColor = new Color4(0.1, 0.1, 0.1, 1.0);
    this.scene.ambientColor = new Color3(0.3, 0.3, 0.3);
  }

  /**
   * Setup the camera
   */
  private setupCamera(): void {
    if (!this.scene || !this.canvas) return;
    
    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 2.5,
      20,
      Vector3.Zero(),
      this.scene
    );
    
    this.camera.attachControl(this.canvas, true);
    this.camera.setTarget(Vector3.Zero());
  }

  /**
   * Setup lighting
   */
  private setupLighting(): void {
    if (!this.scene) return;
    
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
    light.intensity = 0.7;
  }

  /**
   * Start the render loop
   */
  private startRenderLoop(): void {
    if (!this.engine || !this.scene) return;
    
    this.engine.runRenderLoop(() => {
      this.scene?.render();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this.engine?.resize();
    });
  }

  /**
   * Render a point cloud
   */
  renderPointCloud(id: string, pointCloudData: PointCloudData, options: RenderOptions): void {
    if (!this.scene) {
      console.error('RenderService: Scene not initialized');
      return;
    }

    console.log(`RenderService: Rendering point cloud ${id} with ${pointCloudData.points.length} points`);

    // Remove existing mesh if it exists
    this.removePointCloud(id);

    // Create point cloud mesh
    const mesh = this.createPointCloudMesh(id, pointCloudData, options);
    this.pointCloudMeshes.set(id, mesh);

    // Update scene background
    this.scene.clearColor = new Color4(
      options.backgroundColor.r,
      options.backgroundColor.g,
      options.backgroundColor.b,
      1.0
    );

    this.emit('pointCloudRendered', { id, pointCount: pointCloudData.points.length });
  }

  /**
   * Create a mesh for point cloud rendering
   */
  private createPointCloudMesh(id: string, pointCloudData: PointCloudData, options: RenderOptions): Mesh {
    if (!this.scene) throw new Error('Scene not initialized');

    const points = pointCloudData.points;
    const positions: number[] = [];
    const colors: number[] = [];

    // Prepare vertex data
    for (const point of points) {
      // Position
      positions.push(point.position.x, point.position.y, point.position.z);
      
      // Color based on mode
      let color = { r: 1, g: 1, b: 1 }; // Default white
      
      if (options.colorMode === 'original' && point.color) {
        color = point.color;
      } else if (options.colorMode === 'intensity' && point.intensity !== undefined) {
        const intensity = point.intensity;
        color = { r: intensity, g: intensity, b: intensity };
      } else if (options.colorMode === 'height') {
        const normalizedHeight = (point.position.y - pointCloudData.metadata.bounds.min.y) / 
                                (pointCloudData.metadata.bounds.max.y - pointCloudData.metadata.bounds.min.y);
        color = this.heightToColor(normalizedHeight);
      } else if (options.colorMode === 'classification' && point.classification !== undefined) {
        color = this.classificationToColor(point.classification);
      }
      
      colors.push(color.r, color.g, color.b, 1.0);
    }

    // Create custom mesh
    const mesh = new Mesh(`pointCloud_${id}`, this.scene);
    
    // Create vertex data
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.colors = colors;
    vertexData.applyToMesh(mesh, true);

    // Create material
    const material = new StandardMaterial(`pointCloudMaterial_${id}`, this.scene);
    material.emissiveColor = new Color3(1, 1, 1);
    material.disableLighting = true;
    material.pointsCloud = true;
    material.pointSize = options.pointSize;
    mesh.material = material;

    return mesh;
  }

  /**
   * Remove a point cloud from the scene
   */
  removePointCloud(id: string): void {
    const mesh = this.pointCloudMeshes.get(id);
    if (mesh) {
      mesh.dispose();
      this.pointCloudMeshes.delete(id);
      this.emit('pointCloudRemoved', { id });
    }
  }

  /**
   * Convert height to color (blue to red gradient)
   */
  private heightToColor(normalizedHeight: number): { r: number; g: number; b: number } {
    const clampedHeight = Math.max(0, Math.min(1, normalizedHeight));
    
    if (clampedHeight < 0.5) {
      // Blue to green
      const t = clampedHeight * 2;
      return { r: 0, g: t, b: 1 - t };
    } else {
      // Green to red
      const t = (clampedHeight - 0.5) * 2;
      return { r: t, g: 1 - t, b: 0 };
    }
  }

  /**
   * Convert classification to color
   */
  private classificationToColor(classification: number): { r: number; g: number; b: number } {
    const colors = [
      { r: 0, g: 0, b: 0 },       // 0: Black
      { r: 1, g: 0, b: 0 },       // 1: Red
      { r: 0, g: 1, b: 0 },       // 2: Green
      { r: 0, g: 0, b: 1 },       // 3: Blue
      { r: 1, g: 1, b: 0 },       // 4: Yellow
      { r: 1, g: 0, b: 1 },       // 5: Magenta
      { r: 0, g: 1, b: 1 },       // 6: Cyan
      { r: 1, g: 0.5, b: 0 },     // 7: Orange
      { r: 0.5, g: 0, b: 1 },     // 8: Purple
      { r: 0, g: 0.5, b: 0 },     // 9: Dark Green
    ];
    
    return colors[classification % colors.length];
  }
}