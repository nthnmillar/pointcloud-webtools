import { BaseService } from '../BaseService';
import { VoxelDownsamplingWASM } from './VoxelDownsampling/VoxelDownsamplingWASM';
import { VoxelDownsamplingTS } from './VoxelDownsampling/VoxelDownsamplingTS';
import { VoxelDownsamplingBackend } from './VoxelDownsampling/VoxelDownsamplingBackend';
import type { ServiceManager } from '../ServiceManager';

export class ToolsService extends BaseService {
  private _voxelDownsamplingWASM: VoxelDownsamplingWASM;
  private _voxelDownsamplingTS: VoxelDownsamplingTS;
  private _voxelDownsamplingBackend: VoxelDownsamplingBackend;
  private _serviceManager?: ServiceManager;

  constructor(serviceManager?: ServiceManager) {
    super();
    this._serviceManager = serviceManager;
    this._voxelDownsamplingWASM = new VoxelDownsamplingWASM(this, serviceManager);
    this._voxelDownsamplingTS = new VoxelDownsamplingTS(this, serviceManager);
    this._voxelDownsamplingBackend = new VoxelDownsamplingBackend(this);
  }

  async initialize(): Promise<void> {
    await this._voxelDownsamplingWASM.initialize();
    await this._voxelDownsamplingTS.initialize();
    this.isInitialized = true;
  }

  // Generic tool access
  get voxelDownsamplingWASM(): VoxelDownsamplingWASM {
    return this._voxelDownsamplingWASM;
  }

  get voxelDownsamplingTS(): VoxelDownsamplingTS {
    return this._voxelDownsamplingTS;
  }

  get voxelDownsamplingBackend(): VoxelDownsamplingBackend {
    return this._voxelDownsamplingBackend;
  }

  // Legacy access for backward compatibility
  get voxelDownsampling(): VoxelDownsamplingWASM {
    return this._voxelDownsamplingWASM;
  }

  // Event forwarding for tools
  forwardEvent(eventName: string, data: any): void {
    this.emit(eventName, data);
  }

  // Future tools can be added here
  // get passThroughFilter(): PassThroughFilter { return this._passThroughFilter; }
  // get outlierRemoval(): OutlierRemoval { return this._outlierRemoval; }
  // get planeSegmentation(): PlaneSegmentation { return this._planeSegmentation; }

  // Future tool methods can be added here
  // async passThroughFilterWasm(params: PassThroughParams): Promise<PassThroughResult> { ... }
  // async statisticalOutlierRemovalWasm(params: OutlierParams): Promise<OutlierResult> { ... }
  // async planeSegmentationWasm(params: PlaneParams): Promise<PlaneResult> { ... }

  dispose(): void {
    this._voxelDownsamplingWASM.dispose();
    this._voxelDownsamplingTS.dispose();
    this._voxelDownsamplingBackend.dispose();
    this.removeAllObservers();
  }
}
