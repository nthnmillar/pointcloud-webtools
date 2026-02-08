import { BaseService } from '../../BaseService';
import { Log } from '../../../utils/Log';
import type { ServiceManager } from '../../ServiceManager';
import { PointCloudSmoothingWASMCPP } from './PointCloudSmoothingWASMCPP';
import { PointCloudSmoothingWASMRust } from './PointCloudSmoothingWASMRust';
import { PointCloudSmoothingTS } from './PointCloudSmoothingTS';
import { PointCloudSmoothingBECPP } from './PointCloudSmoothingBECPP';
import { PointCloudSmoothingBERust } from './PointCloudSmoothingBERust';
import { PointCloudSmoothingBEPython } from './PointCloudSmoothingBEPython';
import type {
  PointCloudSmoothingParams,
  PointCloudSmoothingResult,
} from '../ToolsService';

export class PointCloudSmoothingService extends BaseService {
  private _isInitialized = false;

  public pointCloudSmoothingWASMCPP: PointCloudSmoothingWASMCPP;
  public pointCloudSmoothingWASMRust: PointCloudSmoothingWASMRust;
  public pointCloudSmoothingTS: PointCloudSmoothingTS;
  public pointCloudSmoothingBECPP: PointCloudSmoothingBECPP;
  public pointCloudSmoothingBERust: PointCloudSmoothingBERust;
  public pointCloudSmoothingBEPython: PointCloudSmoothingBEPython;

  constructor(serviceManager: ServiceManager) {
    super();
    this.pointCloudSmoothingWASMCPP = new PointCloudSmoothingWASMCPP(
      serviceManager
    );
    this.pointCloudSmoothingWASMRust = new PointCloudSmoothingWASMRust(
      serviceManager
    );
    this.pointCloudSmoothingTS = new PointCloudSmoothingTS(serviceManager);
    this.pointCloudSmoothingBECPP = new PointCloudSmoothingBECPP();
    this.pointCloudSmoothingBERust = new PointCloudSmoothingBERust();
    this.pointCloudSmoothingBEPython = new PointCloudSmoothingBEPython();
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    try {
      Log.InfoClass(this, 'Initializing PointCloudSmoothingService...');

      Log.InfoClass(this, 'Initializing WASM C++ service...');
      await this.pointCloudSmoothingWASMCPP.initialize();
      Log.InfoClass(this, 'WASM C++ service initialized successfully');

      Log.InfoClass(this, 'Initializing TS service...');
      await this.pointCloudSmoothingTS.initialize();
      Log.InfoClass(this, 'TS service initialized successfully');

      Log.InfoClass(this, 'Initializing Rust WASM service...');
      await this.pointCloudSmoothingWASMRust.initialize();
      Log.InfoClass(this, 'Rust WASM service initialized successfully');

      Log.InfoClass(this, 'Initializing BE C++ service...');
      await this.pointCloudSmoothingBECPP.initialize();
      Log.InfoClass(this, 'BE C++ service initialized successfully');

      Log.InfoClass(this, 'Initializing BE Rust service...');
      await this.pointCloudSmoothingBERust.initialize();
      Log.InfoClass(this, 'BE Rust service initialized successfully');

      Log.InfoClass(this, 'Initializing BE Python service...');
      await this.pointCloudSmoothingBEPython.initialize();
      Log.InfoClass(this, 'BE Python service initialized successfully');

      this._isInitialized = true;
      Log.InfoClass(
        this,
        'PointCloudSmoothingService initialized successfully'
      );
    } catch (error) {
      Log.ErrorClass(
        this,
        'Failed to initialize PointCloudSmoothingService',
        error
      );
      throw error;
    }
  }

  get ready(): boolean {
    return this._isInitialized;
  }

  async performPointCloudSmoothingWASMCPP(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingWASMCPP.pointCloudSmoothing(params);
  }

  async performPointCloudSmoothingWASMRust(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingWASMRust.performPointCloudSmoothing(params);
  }

  async performPointCloudSmoothingTS(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingTS.pointCloudSmoothing(params);
  }

  async performPointCloudSmoothingBECPP(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingBECPP.pointCloudSmooth({
      pointCloudData: params.points,
      colors: params.colors,
      intensities: params.intensities,
      classifications: params.classifications,
      smoothingRadius: params.smoothingRadius,
      iterations: params.iterations,
    });
  }

  async performPointCloudSmoothingBERust(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingBERust.pointCloudSmooth({
      pointCloudData: params.points,
      colors: params.colors,
      intensities: params.intensities,
      classifications: params.classifications,
      smoothingRadius: params.smoothingRadius,
      iterations: params.iterations,
    });
  }

  async performPointCloudSmoothingBEPython(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingBEPython.pointCloudSmooth({
      pointCloudData: params.points,
      smoothingRadius: params.smoothingRadius,
      iterations: params.iterations,
    });
  }

  dispose(): void {
    this.pointCloudSmoothingWASMCPP?.dispose();
    this.pointCloudSmoothingWASMRust?.dispose();
    this.pointCloudSmoothingTS?.dispose();
    this.pointCloudSmoothingBECPP?.dispose();
    this.pointCloudSmoothingBERust?.dispose();
    this.pointCloudSmoothingBEPython?.dispose();
    this._isInitialized = false;
    this.removeAllObservers();
  }
}
