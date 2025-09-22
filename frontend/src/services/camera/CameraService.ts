import {
  ArcRotateCamera,
  Vector3,
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
} from '@babylonjs/core';
import { BaseService } from '../BaseService';

/**
 * Camera Service - Handles camera setup and controls
 */
export class CameraService extends BaseService {
  private _camera: ArcRotateCamera | null = null;
  private _scene: Scene | null = null;
  private _targetSphere: Mesh | null = null;

  // Camera control properties
  private _zoomSensitivity: number = 0.005;
  private _panningSensitivity: number = 0.05;
  private _wheelPrecision: number = 0.01;
  private _panningSensibility: number = 5;
  private _targetEnabled: boolean = true;

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
      50, // Increased distance to see the point cloud better
      Vector3.Zero(),
      this._scene
    );

    this._camera.attachControl(canvas, true);
    this._camera.setTarget(Vector3.Zero());

    // Create target sphere
    this.createTargetSphere();

    // Set initial camera control sensitivities
    this.updateCameraControls();

    // Add event listener to update target sphere when camera moves
    this._camera.onViewMatrixChangedObservable.add(() => {
      this.updateTargetSphere();
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

    // Update wheel precision for zoom sensitivity (invert so higher slider = more sensitive)
    this._camera.wheelPrecision = this._wheelPrecision / this._zoomSensitivity;

    // Update panning sensibility (invert so higher slider = more sensitive)
    this._camera.panningSensibility =
      this._panningSensibility / this._panningSensitivity;
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
    this._camera.radius = 50; // Match the initial setup distance
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
}
