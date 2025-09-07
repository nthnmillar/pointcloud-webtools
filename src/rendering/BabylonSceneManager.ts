import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  SceneLoader,
  AssetsManager,
  AbstractMesh,
  PointerEventTypes,
  PointerInfo,
  VertexData
} from '@babylonjs/core';
import { Observable } from '../core/Observable';
import type { 
  PointCloudData, 
  PointCloudPoint, 
  RenderOptions, 
  CameraSettings,
  Point3D 
} from '../types/PointCloud';

/**
 * Babylon.js Scene Manager - Handles 3D scene setup and rendering
 */
export class BabylonSceneManager extends Observable<any> {
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private canvas: HTMLCanvasElement;
  private pointCloudMeshes: Map<string, Mesh> = new Map();
  private boundingBoxMesh: Mesh | null = null;
  private axesMesh: Mesh | null = null;

  constructor(canvas: HTMLCanvasElement) {
    super();
    this.canvas = canvas;
    this.engine = new Engine(canvas, true);
    this.scene = new Scene(this.engine);
    
    this.setupScene();
    this.setupCamera();
    this.setupLighting();
    this.setupEventHandlers();
    this.startRenderLoop();
  }

  /**
   * Initialize the scene
   */
  private setupScene(): void {
    this.scene.clearColor = new Color4(0.1, 0.1, 0.1, 1.0);
    this.scene.ambientColor = new Color3(0.3, 0.3, 0.3);
  }

  /**
   * Setup the camera
   */
  private setupCamera(): void {
    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 2.5,
      50,
      Vector3.Zero(),
      this.scene
    );
    
    this.camera.attachControl(this.canvas, true);
    this.camera.setTarget(Vector3.Zero());
    this.camera.wheelPrecision = 50;
    this.camera.pinchPrecision = 50;
  }

  /**
   * Setup lighting
   */
  private setupLighting(): void {
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
    light.intensity = 0.7;
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle window resize
    window.addEventListener('resize', () => {
      this.engine.resize();
    });

    // Handle pointer events for interaction
    this.scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        this.emit('pointerDown', pointerInfo);
      } else if (pointerInfo.type === PointerEventTypes.POINTERUP) {
        this.emit('pointerUp', pointerInfo);
      }
    });
  }

  /**
   * Start the render loop
   */
  private startRenderLoop(): void {
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
  }

  /**
   * Render a point cloud
   */
  renderPointCloud(id: string, pointCloudData: PointCloudData, options: RenderOptions): void {
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

    // Show/hide bounding box
    if (options.showBoundingBox) {
      this.showBoundingBox(pointCloudData);
    } else {
      this.hideBoundingBox();
    }

    // Show/hide axes
    if (options.showAxes) {
      this.showAxes();
    } else {
      this.hideAxes();
    }

    // Auto-fit camera to point cloud
    this.fitCameraToPointCloud(pointCloudData);
  }

  /**
   * Create a mesh for point cloud rendering
   */
  private createPointCloudMesh(id: string, pointCloudData: PointCloudData, options: RenderOptions): Mesh {
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
    }
  }

  /**
   * Show bounding box for point cloud
   */
  private showBoundingBox(pointCloudData: PointCloudData): void {
    this.hideBoundingBox(); // Remove existing bounding box

    const bounds = pointCloudData.metadata.bounds;
    const size = {
      x: bounds.max.x - bounds.min.x,
      y: bounds.max.y - bounds.min.y,
      z: bounds.max.z - bounds.min.z
    };
    
    const center = {
      x: (bounds.max.x + bounds.min.x) / 2,
      y: (bounds.max.y + bounds.min.y) / 2,
      z: (bounds.max.z + bounds.min.z) / 2
    };

    this.boundingBoxMesh = MeshBuilder.CreateBox('boundingBox', {
      width: size.x,
      height: size.y,
      depth: size.z
    }, this.scene);

    this.boundingBoxMesh.position = new Vector3(center.x, center.y, center.z);
    
    const material = new StandardMaterial('boundingBoxMaterial', this.scene);
    material.wireframe = true;
    material.emissiveColor = new Color3(1, 1, 0);
    material.disableLighting = true;
    this.boundingBoxMesh.material = material;
  }

  /**
   * Hide bounding box
   */
  private hideBoundingBox(): void {
    if (this.boundingBoxMesh) {
      this.boundingBoxMesh.dispose();
      this.boundingBoxMesh = null;
    }
  }

  /**
   * Show coordinate axes
   */
  private showAxes(): void {
    this.hideAxes(); // Remove existing axes

    const axisLength = 20;
    
    // X axis (red)
    const xAxis = MeshBuilder.CreateCylinder('xAxis', {
      height: axisLength,
      diameter: 0.2
    }, this.scene);
    xAxis.rotation.z = Math.PI / 2;
    xAxis.position.x = axisLength / 2;
    
    const xMaterial = new StandardMaterial('xAxisMaterial', this.scene);
    xMaterial.emissiveColor = new Color3(1, 0, 0);
    xMaterial.disableLighting = true;
    xAxis.material = xMaterial;

    // Y axis (green)
    const yAxis = MeshBuilder.CreateCylinder('yAxis', {
      height: axisLength,
      diameter: 0.2
    }, this.scene);
    yAxis.position.y = axisLength / 2;
    
    const yMaterial = new StandardMaterial('yAxisMaterial', this.scene);
    yMaterial.emissiveColor = new Color3(0, 1, 0);
    yMaterial.disableLighting = true;
    yAxis.material = yMaterial;

    // Z axis (blue)
    const zAxis = MeshBuilder.CreateCylinder('zAxis', {
      height: axisLength,
      diameter: 0.2
    }, this.scene);
    zAxis.rotation.x = Math.PI / 2;
    zAxis.position.z = axisLength / 2;
    
    const zMaterial = new StandardMaterial('zAxisMaterial', this.scene);
    zMaterial.emissiveColor = new Color3(0, 0, 1);
    zMaterial.disableLighting = true;
    zAxis.material = zMaterial;

    // Group axes
    this.axesMesh = new Mesh('axesGroup', this.scene);
    xAxis.parent = this.axesMesh;
    yAxis.parent = this.axesMesh;
    zAxis.parent = this.axesMesh;
  }

  /**
   * Hide coordinate axes
   */
  private hideAxes(): void {
    if (this.axesMesh) {
      this.axesMesh.dispose();
      this.axesMesh = null;
    }
  }

  /**
   * Fit camera to point cloud bounds
   */
  private fitCameraToPointCloud(pointCloudData: PointCloudData): void {
    const bounds = pointCloudData.metadata.bounds;
    const center = {
      x: (bounds.max.x + bounds.min.x) / 2,
      y: (bounds.max.y + bounds.min.y) / 2,
      z: (bounds.max.z + bounds.min.z) / 2
    };

    const size = Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    );

    this.camera.setTarget(new Vector3(center.x, center.y, center.z));
    this.camera.radius = size * 2;
  }

  /**
   * Update camera settings
   */
  updateCameraSettings(settings: CameraSettings): void {
    this.camera.position = new Vector3(settings.position.x, settings.position.y, settings.position.z);
    this.camera.setTarget(new Vector3(settings.target.x, settings.target.y, settings.target.z));
    this.camera.fov = settings.fov;
    this.camera.minZ = settings.near;
    this.camera.maxZ = settings.far;
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

  /**
   * Get current camera settings
   */
  getCameraSettings(): CameraSettings {
    return {
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z
      },
      target: {
        x: this.camera.target.x,
        y: this.camera.target.y,
        z: this.camera.target.z
      },
      fov: this.camera.fov,
      near: this.camera.minZ,
      far: this.camera.maxZ
    };
  }

  /**
   * Dispose of the scene and engine
   */
  dispose(): void {
    this.engine.dispose();
    this.scene.dispose();
  }
}
