import {
  Engine,
  Scene,
  HemisphericLight,
  Vector3,
  Color3,
  Color4,
} from '@babylonjs/core';
import { BaseService } from '../BaseService';
import { CameraService } from '../camera/CameraService';

/**
 * Scene Service - Handles Babylon.js scene setup and management
 */
export class SceneService extends BaseService {
  private _engine: Engine | null = null;
  private _scene: Scene | null = null;
  private _cameraService: CameraService;

  constructor() {
    super();
    this._cameraService = new CameraService();
  }

  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    this._engine = new Engine(canvas, true);
    this._scene = new Scene(this._engine);

    this.setupScene();
    this.setupLighting();
    this.startRenderLoop();

    // Initialize camera service with the scene
    await this._cameraService.initialize(this._scene, canvas);

    this.isInitialized = true;
    this.emit('initialized');
  }

  dispose(): void {
    if (this._engine) {
      this._engine.dispose();
    }
    if (this._scene) {
      this._scene.dispose();
    }
    this._cameraService.dispose();
    this.removeAllObservers();
  }

  /**
   * Initialize the scene
   */
  private setupScene(): void {
    if (!this._scene) return;

    this._scene.clearColor = new Color4(0.1, 0.1, 0.1, 1.0);
    this._scene.ambientColor = new Color3(0.3, 0.3, 0.3);
  }

  /**
   * Setup lighting
   */
  private setupLighting(): void {
    if (!this._scene) return;

    const light = new HemisphericLight(
      'light',
      new Vector3(0, 1, 0),
      this._scene
    );
    light.intensity = 0.7;
  }

  /**
   * Start the render loop
   */
  private startRenderLoop(): void {
    if (!this._engine || !this._scene) return;

    this._engine.runRenderLoop(() => {
      this._scene?.render();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this.engine?.resize();
    });
  }

  /**
   * Update scene background
   */
  updateBackgroundColor(backgroundColor: {
    r: number;
    g: number;
    b: number;
  }): void {
    if (this._scene) {
      this._scene.clearColor = new Color4(
        backgroundColor.r,
        backgroundColor.g,
        backgroundColor.b,
        1.0
      );
    }
  }

  /**
   * Get the scene for other services to use
   */
  get scene(): Scene | null {
    return this._scene;
  }

  /**
   * Get the engine
   */
  get engine(): Engine | null {
    return this._engine;
  }

  /**
   * Get the camera service
   */
  get cameraService(): CameraService {
    return this._cameraService;
  }

  /**
   * Get the camera (for backward compatibility)
   */
  get camera() {
    return this._cameraService.camera;
  }
}
