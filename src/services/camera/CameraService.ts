import {
  ArcRotateCamera,
  Vector3,
  Scene
} from '@babylonjs/core';
import { BaseService } from '../BaseService';

/**
 * Camera Service - Handles camera setup and controls
 */
export class CameraService extends BaseService {
  private _camera: ArcRotateCamera | null = null;
  private _scene: Scene | null = null;
  
  // Camera control properties
  private _zoomSensitivity: number = 0.005;
  private _panningSensitivity: number = 0.05;
  private _wheelPrecision: number = 0.01;
  private _panningSensibility: number = 5;

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
      20,
      Vector3.Zero(),
      this._scene
    );
    
    this._camera.attachControl(canvas, true);
    this._camera.setTarget(Vector3.Zero());
    
    // Set initial camera control sensitivities
    this.updateCameraControls();
  }

  /**
   * Update camera control settings
   */
  private updateCameraControls(): void {
    if (!this._camera) return;
    
    // Update wheel precision for zoom sensitivity (invert so higher slider = more sensitive)
    this._camera.wheelPrecision = this._wheelPrecision / this._zoomSensitivity;
    
    // Update panning sensibility (invert so higher slider = more sensitive)
    this._camera.panningSensibility = this._panningSensibility / this._panningSensitivity;
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
    this._camera.radius = 20;
  }

  /**
   * Set camera target
   */
  setTarget(target: Vector3): void {
    if (!this._camera) return;
    this._camera.setTarget(target);
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
