import { BaseService } from '../../BaseService';
import { Log } from '../../../utils/Log';
import type { ServiceManager } from '../../ServiceManager';
import { VoxelDownsamplingWASMCPP } from './VoxelDownsamplingWASMCPP';
import { VoxelDownsamplingWASMRust } from './VoxelDownsamplingWASMRust';
import { VoxelDownsamplingTS } from './VoxelDownsamplingTS';
import { VoxelDownsamplingBECPP } from './VoxelDownsamplingBECPP';
import { VoxelDownsamplingBERust } from './VoxelDownsamplingBERust';
import { VoxelDownsamplingBEPython } from './VoxelDownsamplingBEPython';
import { VoxelDebugVisualization } from '../VoxelDownsampleDebug/VoxelDebugVisualization';
import type {
  VoxelDownsampleParams,
  VoxelDownsampleResult,
} from '../ToolsService';

export class VoxelDownsampleService extends BaseService {
  private _isInitialized = false;

  public voxelDownsamplingWASMCPP: VoxelDownsamplingWASMCPP;
  public voxelDownsamplingWASMRust: VoxelDownsamplingWASMRust;
  public voxelDownsamplingTS: VoxelDownsamplingTS;
  public voxelDownsamplingBECPP: VoxelDownsamplingBECPP;
  public voxelDownsamplingBERust: VoxelDownsamplingBERust;
  public voxelDownsamplingBEPython: VoxelDownsamplingBEPython;
  public voxelDownsampleDebug: VoxelDebugVisualization | null = null;

  constructor(serviceManager: ServiceManager) {
    super();
    this.voxelDownsamplingWASMCPP = new VoxelDownsamplingWASMCPP(
      serviceManager
    );
    this.voxelDownsamplingWASMRust = new VoxelDownsamplingWASMRust(
      serviceManager
    );
    this.voxelDownsamplingTS = new VoxelDownsamplingTS(serviceManager);
    this.voxelDownsamplingBECPP = new VoxelDownsamplingBECPP(serviceManager);
    this.voxelDownsamplingBERust = new VoxelDownsamplingBERust();
    this.voxelDownsamplingBEPython = new VoxelDownsamplingBEPython();

    // Initialize debug visualization after a short delay to ensure scene is ready
    setTimeout(() => {
      if (serviceManager.sceneService?.scene) {
        this.voxelDownsampleDebug = new VoxelDebugVisualization(
          serviceManager.sceneService.scene,
          serviceManager
        );
      } else {
        Log.WarnClass(
          this,
          'Scene not available for voxel debug initialization'
        );
      }
    }, 100);
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    try {
      Log.InfoClass(this, 'Initializing VoxelDownsampleService...');

      // Initialize all services
      Log.InfoClass(this, 'Initializing WASM module...');
      await this.voxelDownsamplingWASMCPP.initialize();
      Log.InfoClass(this, 'WASM module initialized successfully');

      Log.InfoClass(this, 'Initializing TS service...');
      await this.voxelDownsamplingTS.initialize();
      Log.InfoClass(this, 'TS service initialized successfully');

      Log.InfoClass(this, 'Initializing Rust WASM service...');
      await this.voxelDownsamplingWASMRust.initialize();
      Log.InfoClass(this, 'Rust WASM service initialized successfully');

      Log.InfoClass(this, 'Initializing BE C++ service...');
      await this.voxelDownsamplingBECPP.initialize();
      Log.InfoClass(this, 'BE C++ service initialized successfully');

      Log.InfoClass(this, 'Initializing BE Rust service...');
      await this.voxelDownsamplingBERust.initialize();
      Log.InfoClass(this, 'BE Rust service initialized successfully');

      Log.InfoClass(this, 'Initializing BE Python service...');
      await this.voxelDownsamplingBEPython.initialize();
      Log.InfoClass(this, 'BE Python service initialized successfully');

      this._isInitialized = true;
      Log.InfoClass(this, 'VoxelDownsampleService initialized successfully');
    } catch (error) {
      Log.ErrorClass(
        this,
        'Failed to initialize VoxelDownsampleService',
        error
      );
      throw error;
    }
  }

  get ready(): boolean {
    return this._isInitialized;
  }

  async voxelDownsampleWASMRust(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    return this.voxelDownsamplingWASMRust.voxelDownsample(params);
  }

  async voxelDownsampleBEPython(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    const result =
      await this.voxelDownsamplingBEPython.performVoxelDownsampling({
        pointCloudData: params.pointCloudData,
        voxelSize: params.voxelSize,
        globalBounds: params.globalBounds,
      });

    return {
      success: result.success,
      downsampledPoints: result.downsampledPoints,
      originalCount: result.originalCount,
      downsampledCount: result.downsampledCount,
      processingTime: result.processingTime,
      voxelCount: result.voxelCount,
    };
  }

  dispose(): void {
    this.voxelDownsamplingWASMCPP?.dispose();
    this.voxelDownsamplingWASMRust?.dispose();
    this.voxelDownsamplingTS?.dispose();
    this.voxelDownsamplingBECPP?.dispose();
    this.voxelDownsamplingBERust?.dispose();
    this.voxelDownsamplingBEPython?.dispose();
    this._isInitialized = false;
    this.removeAllObservers();
  }
}
