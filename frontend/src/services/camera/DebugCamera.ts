import { ArcRotateCamera, Vector3, Scene } from '@babylonjs/core';

export class DebugCamera {
  private _camera: ArcRotateCamera | null = null;
  private _scene: Scene | null = null;
  private _isActive = false;

  constructor(scene: Scene) {
    this._scene = scene;
    this.createCamera();
  }

  /**
   * Create the debug camera
   */
  private createCamera(): void {
    if (!this._scene) return;

    // Simple ArcRotateCamera positioned externally
    this._camera = new ArcRotateCamera("debugCamera", Math.PI / 2, Math.PI / 4, 20, Vector3.Zero(), this._scene);
    
    // Set initial sensitivity values to match main camera defaults
    // These values are calculated from the main camera's default sensitivity settings
    this._camera.wheelPrecision = 2.899; // Calculated from zoomSensitivity = 0.005
    this._camera.panningSensibility = 184.49; // Calculated from panningSensitivity = 0.05
    this._camera.panningInertia = 0.9; // Smooth panning
    this._camera.wheelDeltaPercentage = 0; // Disable for equal zoom in/out
  }


  /**
   * Activate the debug camera
   */
  activate(): void {
    if (!this._camera || !this._scene) return;
    this._scene.activeCamera = this._camera;
    this._isActive = true;
  }

  /**
   * Deactivate the debug camera
   */
  deactivate(): void {
    this._isActive = false;
  }

  /**
   * Get the camera instance
   */
  get camera(): ArcRotateCamera | null {
    return this._camera;
  }

  /**
   * Check if camera is active
   */
  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Dispose of the debug camera
   */
  dispose(): void {
    this._isActive = false;
    if (this._camera) {
      this._camera.dispose();
      this._camera = null;
    }
    this._scene = null;
  }
}
