import { Engine, Scene, HemisphericLight, Vector3, Color4, StandardMaterial, Color3 } from '@babylonjs/core';
import { BaseService } from '../BaseService';
import { Log } from '../../utils/Log';

export class SceneService extends BaseService {
  private _engine: Engine | null = null;
  private _scene: Scene | null = null;
  private _light: HemisphericLight | null = null;
  private _isWebGLReady = false;

  constructor() {
    super();
  }


  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    try {
      // Create engine
      this._engine = new Engine(canvas, true);

      // Create scene
      this._scene = new Scene(this._engine);
      
      // Set background color
      this._scene.clearColor = new Color4(0.1, 0.1, 0.1, 1.0); // Dark gray background

      // Camera will be created by CameraService

      // Create light
      this._light = new HemisphericLight("light", new Vector3(0, 1, 0), this._scene);
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

      this._isWebGLReady = true;
      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      throw error;
    }
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
    
    this._camera = null;
    this._light = null;
    this._isWebGLReady = false;
    this.isInitialized = false;
  }
}