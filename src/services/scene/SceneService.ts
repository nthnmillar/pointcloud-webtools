import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  Color3,
  Color4
} from '@babylonjs/core';
import { BaseService } from '../BaseService';

/**
 * Scene Service - Handles Babylon.js scene setup and management
 */
export class SceneService extends BaseService {
  private _engine: Engine | null = null;
  private _scene: Scene | null = null;
  private _camera: ArcRotateCamera | null = null;

  async initialize(canvas: HTMLCanvasElement, ...args: any[]): Promise<void> {
    this._engine = new Engine(canvas, true);
    this._scene = new Scene(this._engine);
    
    
    this.setupScene();
    this.setupCamera();
    this.setupLighting();
    this.startRenderLoop();
    
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
   * Setup the camera
   */
  private setupCamera(): void {
    if (!this._scene || !this._engine) return;
    
    this._camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 2.5,
      20,
      Vector3.Zero(),
      this._scene
    );
    
    this._camera.attachControl(this._engine.getRenderingCanvas(), true);
    this._camera.setTarget(Vector3.Zero());
  }

  /**
   * Setup lighting
   */
  private setupLighting(): void {
    if (!this._scene) return;
    
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), this._scene);
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
  updateBackgroundColor(backgroundColor: { r: number; g: number; b: number }): void {
    if (this._scene) {
      this._scene.clearColor = new Color4(backgroundColor.r, backgroundColor.g, backgroundColor.b, 1.0);
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
   * Get the camera
   */
  get camera(): ArcRotateCamera | null {
    return this._camera;
  }

}