import {
  Engine,
  Scene,
  HemisphericLight,
  Vector3,
  Color4,
} from '@babylonjs/core';
import { BaseService } from '../BaseService';

export class SceneService extends BaseService {
  private _engine: Engine | null = null;
  private _scene: Scene | null = null;
  private _light: HemisphericLight | null = null;
  private _isWebGLReady = false;

  constructor() {
    super();
  }

  async initialize(canvas?: HTMLCanvasElement, engine?: Engine): Promise<void> {
    if (engine) {
      this._engine = engine;
    } else if (canvas) {
      this._engine = new Engine(canvas, true);
    } else {
      throw new Error('Either canvas or engine must be provided');
    }

    // Create scene
    this._scene = new Scene(this._engine);

    // Set background color
    this._scene.clearColor = new Color4(0.1, 0.1, 0.1, 1.0); // Dark gray background

    // Camera will be created by CameraService

    // Create light
    this._light = new HemisphericLight(
      'light',
      new Vector3(0, 1, 0),
      this._scene
    );
    this._light.intensity = 0.7;

    // Start render loop
    if (this._engine) {
      this._engine.runRenderLoop(() => {
        this._scene?.render();
      });
    }

    // Handle window resize
    window.addEventListener('resize', () => {
      this._engine?.resize();
    });

    // Debug layer removed to avoid CDN dependency issues

    this._isWebGLReady = true;
    this.isInitialized = true;
    this.emit('initialized');
  }

  get engine(): Engine | null {
    return this._engine;
  }

  get scene(): Scene | null {
    return this._scene;
  }

  get isWebGLReady(): boolean {
    return this._isWebGLReady;
  }

  dispose(): void {
    if (this._scene) {
      this._scene.dispose();
      this._scene = null;
    }

    if (this._engine) {
      this._engine.dispose();
      this._engine = null;
    }

    this._light = null;
    this._isWebGLReady = false;
    this.isInitialized = false;
  }
}
