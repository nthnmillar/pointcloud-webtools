import {
  ArcRotateCamera,
  Vector3,
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  LinesMesh,
  CreateLines,
  Camera,
  FreeCamera,
} from '@babylonjs/core';
import { DebugCamera } from './DebugCamera';
import { BaseService } from '../BaseService';

/**
 * Camera Service - Handles camera setup and controls
 */
export class CameraService extends BaseService {
  private _camera: ArcRotateCamera | null = null;
  private _scene: Scene | null = null;
  private _targetSphere: Mesh | null = null;
  private _frustumLines: LinesMesh | null = null;
  private _debugCamera: DebugCamera | null = null;
  private _lastFrustumUpdate: number = 0;

  // Camera control properties
  private _zoomSensitivity: number = 0.005;
  private _panningSensitivity: number = 0.05;
  private _targetEnabled: boolean = true;

  constructor() {
    super();
  }

  async initialize(scene: Scene, canvas: HTMLCanvasElement): Promise<void> {
    this._scene = scene;
    this.setupCamera(canvas);

    this.isInitialized = true;
    this.emit('initialized');
  }

  dispose(): void {
    if (this._camera) {
      this._camera.dispose();
    }
    if (this._targetSphere) {
      this._targetSphere.dispose();
    }
    if (this._frustumLines) {
      this._frustumLines.dispose();
    }
    if (this._debugCamera) {
      this._debugCamera.dispose();
    }
    this.removeAllObservers();
  }

  /**
   * Setup the camera
   */
  private setupCamera(canvas: HTMLCanvasElement): void {
    if (!this._scene) return;

    this._camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 2.5,
      30, // Closer distance to see the point cloud better
      Vector3.Zero(),
      this._scene
    );

    this._camera.attachControl(canvas, true);
    this._camera.setTarget(Vector3.Zero());


    // Create target sphere
    this.createTargetSphere();

    // Set initial camera control sensitivities
    this.updateCameraControls();

    // Add event listener to update target sphere and frustum lines when camera moves
    this._camera.onViewMatrixChangedObservable.add(() => {
      this.updateTargetSphere();
      this.updateFrustumLines();
    });
  }

  /**
   * Create target sphere
   */
  private createTargetSphere(): void {
    if (!this._scene) return;

    // Create a small sphere to show camera target
    this._targetSphere = MeshBuilder.CreateSphere(
      'targetSphere',
      { diameter: 0.5 },
      this._scene
    );


    // Create material for the sphere
    const material = new StandardMaterial('targetMaterial', this._scene);
    material.diffuseColor = new Color3(1, 0, 0); // Red color
    material.emissiveColor = new Color3(1, 0, 0); // Full emissive for solid look
    material.specularColor = new Color3(0, 0, 0); // No specular highlights
    material.specularPower = 0; // No specular power
    material.disableLighting = true; // Disable lighting for flat appearance
    this._targetSphere.material = material;

    // Position at camera target
    this._targetSphere.position = Vector3.Zero();

    // Initially hidden
    this._targetSphere.setEnabled(this._targetEnabled);
  }

  /**
   * Update camera control settings
   */
  private updateCameraControls(): void {
    if (!this._camera) return;

    // Apply controls to main camera
    this.applyCameraControls(this._camera);
    
    // Also apply to debug camera if it exists
    if (this._debugCamera?.camera) {
      this.applyCameraControls(this._debugCamera.camera);
    }
  }

  private applyCameraControls(camera: ArcRotateCamera | FreeCamera | Camera): void {
    if (!camera) return;

    // Check camera type and apply appropriate controls
    if (camera.getClassName() === 'ArcRotateCamera') {
      // Type guard: narrow to ArcRotateCamera
      const arcCamera = camera as ArcRotateCamera;
      
      // For ArcRotateCamera, use wheelPrecision for zoom sensitivity
      // Map 0.001-0.1 to 3.0-0.5 range (inverted: higher slider = lower wheelPrecision = more sensitive)
      // Using wider range to make zoom less sensitive overall
      const newWheelPrecision = Math.max(0.5, Math.min(3.0, 3.0 - (this._zoomSensitivity - 0.001) * (2.5 / 0.099)));
      arcCamera.wheelPrecision = newWheelPrecision;
      
      // Disable wheelDeltaPercentage to ensure equal zoom in/out behavior
      arcCamera.wheelDeltaPercentage = 0;

      // Update panning sensibility using the correct property name
      // Map 0.01-0.5 to 200-10 range (higher slider = lower panningSensibility = more sensitive)
      const newPanningSensibility = Math.max(10, Math.min(200, 200 - (this._panningSensitivity - 0.01) * (190 / 0.49)));
      arcCamera.panningSensibility = newPanningSensibility;
      
      // Also set angularSensibilityX and angularSensibilityY for panning control
      if ('angularSensibilityX' in arcCamera) {
        arcCamera.angularSensibilityX = newPanningSensibility;
      }
      if ('angularSensibilityY' in arcCamera) {
        arcCamera.angularSensibilityY = newPanningSensibility;
      }
      
      // Ensure panning inertia is set for smooth movement
      arcCamera.panningInertia = 0.9;
    } else if (camera.getClassName() === 'FreeCamera') {
      // Type guard: narrow to FreeCamera
      const freeCamera = camera as FreeCamera;
      
      // For FreeCamera, check if properties exist before setting
      if ('wheelPrecision' in freeCamera) {
        const newWheelPrecision = Math.max(0.1, Math.min(2.0, 0.1 + (this._zoomSensitivity - 0.001) * (1.9 / 0.099)));
        (freeCamera as { wheelPrecision: number }).wheelPrecision = newWheelPrecision;
      }

      if ('panningSensibility' in freeCamera) {
        const newPanningSensibility = Math.max(0.1, Math.min(2.0, 0.1 + (this._panningSensitivity - 0.01) * (1.9 / 0.49)));
        (freeCamera as { panningSensibility: number }).panningSensibility = newPanningSensibility;
      }
    }
  }

  /**
   * Update target sphere position
   */
  private updateTargetSphere(): void {
    if (!this._camera || !this._targetSphere) return;

    // Update sphere position to match camera target
    this._targetSphere.position = this._camera.getTarget();
  }

  /**
   * Get the camera
   */
  get camera(): ArcRotateCamera | null {
    return this._camera;
  }

  /**
   * Get current zoom sensitivity
   */
  get zoomSensitivity(): number {
    return this._zoomSensitivity;
  }

  /**
   * Set zoom sensitivity (0.001 to 0.1)
   */
  set zoomSensitivity(value: number) {
    this._zoomSensitivity = Math.max(0.001, Math.min(0.1, value));
    this.updateCameraControls();
    this.emit('zoomSensitivityChanged', { value: this._zoomSensitivity });
  }

  /**
   * Get current panning sensitivity
   */
  get panningSensitivity(): number {
    return this._panningSensitivity;
  }

  /**
   * Set panning sensitivity (0.01 to 0.5)
   */
  set panningSensitivity(value: number) {
    this._panningSensitivity = Math.max(0.01, Math.min(0.5, value));
    this.updateCameraControls();
    this.emit('panningSensitivityChanged', { value: this._panningSensitivity });
  }

  /**
   * Reset camera to default position
   */
  resetCamera(): void {
    if (!this._camera) return;

    this._camera.setTarget(Vector3.Zero());
    this._camera.alpha = -Math.PI / 2;
    this._camera.beta = Math.PI / 2.5;
    this._camera.radius = 30; // Match the initial setup distance
  }

  /**
   * Set camera target
   */
  setTarget(target: Vector3): void {
    if (!this._camera) return;
    
    
    this._camera.setTarget(target);
    this.updateTargetSphere();
  }

  /**
   * Update target sphere position (call this when camera target changes)
   */
  updateTargetPosition(): void {
    this.updateTargetSphere();
  }

  /**
   * Get current target enabled state
   */
  get targetEnabled(): boolean {
    return this._targetEnabled;
  }

  /**
   * Toggle camera target visibility on/off
   */
  set targetEnabled(enabled: boolean) {
    this._targetEnabled = enabled;

    // Show/hide the target sphere
    if (this._targetSphere) {
      this._targetSphere.setEnabled(enabled);
    }

    this.emit('targetEnabledChanged', { enabled: this._targetEnabled });
  }

  /**
   * Toggle target on/off
   */
  toggleTarget(): void {
    this.targetEnabled = !this._targetEnabled;
  }

  /**
   * Get camera position
   */
  getPosition(): Vector3 | null {
    return this._camera?.position || null;
  }

  /**
   * Get camera target
   */
  getTarget(): Vector3 | null {
    return this._camera?.getTarget() || null;
  }

  /**
   * Get debug camera instance
   */
  get debugCamera(): DebugCamera | null {
    return this._debugCamera;
  }

  /**
   * Show/hide camera frustum visualization
   */
  showFrustum(show: boolean = true): void {
    if (!this._camera || !this._scene) return;

    if (show && !this._frustumLines) {
      this.createFrustumLines();
      // Don't automatically create debug camera - let user choose
    } else if (!show && this._frustumLines) {
      this._frustumLines.dispose();
      this._frustumLines = null;
      if (this._debugCamera) {
        this._debugCamera.dispose();
        this._debugCamera = null;
      }
    }
  }

  /**
   * Update frustum lines to match current camera position and rotation
   */
  updateFrustumLines(): void {
    if (!this._frustumLines || !this._camera || !this._scene) return;
    
    // For now, we'll recreate the lines but with throttling to avoid excessive updates
    // In a production app, you'd want to use a more efficient approach like:
    // - Using a single mesh with instanced geometry
    // - Using Babylon.js's built-in frustum visualization
    // - Implementing custom line updating
    
    // Throttle updates to avoid excessive recreation
    if (this._lastFrustumUpdate && Date.now() - this._lastFrustumUpdate < 16) {
      return; // Skip if less than 16ms since last update (60fps max)
    }
    this._lastFrustumUpdate = Date.now();
    
    // Dispose old lines and create new ones
    this._frustumLines.dispose();
    this.createFrustumLines();
  }

  /**
   * Create a debug camera to view the frustum from outside
   */
  private createDebugCamera(): void {
    if (!this._scene) return;

    // Create debug camera using the new DebugCamera class
    this._debugCamera = new DebugCamera(this._scene);
  }

  /**
   * Switch back to main camera
   */
  switchToMainCamera(): void {
    if (this._camera && this._scene) {
      const canvas = this._scene.getEngine().getRenderingCanvas();
      
      // Detach controls from current camera
      if (this._scene.activeCamera && this._scene.activeCamera.detachControl) {
        this._scene.activeCamera.detachControl();
      }
      
      // Deactivate debug camera first
      if (this._debugCamera) {
        this._debugCamera.deactivate();
      }
      
      // Switch to main camera and attach controls
      this._scene.activeCamera = this._camera;
      this._camera.attachControl(canvas, true);
    }
  }

  /**
   * Switch to debug camera to see frustum
   */
  switchToDebugCamera(): void {
    if (!this._scene) {
      return;
    }
    
    const canvas = this._scene.getEngine().getRenderingCanvas();
    
    // Detach controls from current camera
    if (this._scene.activeCamera && this._scene.activeCamera.detachControl) {
      this._scene.activeCamera.detachControl();
    }
    
    // Create debug camera if it doesn't exist
    if (!this._debugCamera) {
      this.createDebugCamera();
    }
    
    if (this._debugCamera) {
      this._debugCamera.activate();
      // Attach controls to debug camera
      this._debugCamera.camera?.attachControl(canvas, true);
    }
  }


  /**
   * Create frustum wireframe lines
   */
  private createFrustumLines(): void {
    if (!this._camera || !this._scene) return;

    // Create lines for frustum edges
    const points: Vector3[] = [];
    
    // Get the camera's actual view matrix to extract correct frustum
    const viewMatrix = this._camera.getViewMatrix();
    const projectionMatrix = this._camera.getProjectionMatrix();
    
    // Extract camera position and direction from view matrix
    const cameraPos = this._camera.position;
    const target = this._camera.getTarget();
    
    // Calculate the actual camera direction (from camera to target)
    const direction = target.subtract(cameraPos).normalize();
    
    // Calculate camera's right and up vectors using the view matrix
    const right = new Vector3(viewMatrix.m[0], viewMatrix.m[4], viewMatrix.m[8]).normalize();
    const up = new Vector3(viewMatrix.m[1], viewMatrix.m[5], viewMatrix.m[9]).normalize();
    
    // Calculate frustum distances
    const nearDistance = this._camera.minZ || 0.1;
    const farDistance = this._camera.maxZ || 1000;
    
    // Extract FOV from projection matrix (more accurate for ArcRotateCamera)
    const fov = 2 * Math.atan(1 / projectionMatrix.m[5]); // Extract FOV from projection matrix
    const aspect = this._scene.getEngine().getAspectRatio(this._camera);
    
    // Calculate frustum dimensions at near and far planes
    const nearHeight = 2 * Math.tan(fov / 2) * nearDistance;
    const nearWidth = nearHeight * aspect;
    const farHeight = 2 * Math.tan(fov / 2) * farDistance;
    const farWidth = farHeight * aspect;
    
    // Calculate near plane corners
    const nearCenter = cameraPos.add(direction.scale(nearDistance));
    const nearCorners = [
      nearCenter.add(right.scale(-nearWidth/2)).add(up.scale(-nearHeight/2)),
      nearCenter.add(right.scale(nearWidth/2)).add(up.scale(-nearHeight/2)),
      nearCenter.add(right.scale(nearWidth/2)).add(up.scale(nearHeight/2)),
      nearCenter.add(right.scale(-nearWidth/2)).add(up.scale(nearHeight/2))
    ];
    
    // Calculate far plane corners
    const farCenter = cameraPos.add(direction.scale(farDistance));
    const farCorners = [
      farCenter.add(right.scale(-farWidth/2)).add(up.scale(-farHeight/2)),
      farCenter.add(right.scale(farWidth/2)).add(up.scale(-farHeight/2)),
      farCenter.add(right.scale(farWidth/2)).add(up.scale(farHeight/2)),
      farCenter.add(right.scale(-farWidth/2)).add(up.scale(farHeight/2))
    ];

    // Connect near plane
    for (let i = 0; i < 4; i++) {
      points.push(nearCorners[i]);
      points.push(nearCorners[(i + 1) % 4]);
    }

    // Connect far plane
    for (let i = 0; i < 4; i++) {
      points.push(farCorners[i]);
      points.push(farCorners[(i + 1) % 4]);
    }

    // Connect near to far
    for (let i = 0; i < 4; i++) {
      points.push(nearCorners[i]);
      points.push(farCorners[i]);
    }

    // Create lines mesh in world space
    this._frustumLines = CreateLines("frustumLines", { points }, this._scene);
    
    // Don't make it a child of the camera - keep it in world space
    // The frustum is already calculated in world coordinates
    
    // Set material
    const material = new StandardMaterial("frustumMaterial", this._scene);
    material.emissiveColor = new Color3(1, 0, 0); // Red color
    this._frustumLines.material = material;
  }
}
