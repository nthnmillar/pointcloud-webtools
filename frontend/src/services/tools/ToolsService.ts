import { BaseService } from '../BaseService';
import { VoxelDownsampling } from './VoxelDownsampling/VoxelDownsampling';
import { VoxelDownsamplingBackend } from './VoxelDownsampling/VoxelDownsamplingBackend';
import type { ServiceManager } from '../ServiceManager';

export class ToolsService extends BaseService {
  private _voxelDownsampling: VoxelDownsampling;
  private _voxelDownsamplingBackend: VoxelDownsamplingBackend;
  private _serviceManager?: ServiceManager;

  constructor(serviceManager?: ServiceManager) {
    super();
    this._serviceManager = serviceManager;
    this._voxelDownsampling = new VoxelDownsampling(this, serviceManager);
    this._voxelDownsamplingBackend = new VoxelDownsamplingBackend(this);
  }

  async initialize(): Promise<void> {
    await this._voxelDownsampling.initialize();
    this.isInitialized = true;
  }

  // Generic tool access
  get voxelDownsampling(): VoxelDownsampling {
    return this._voxelDownsampling;
  }

  get voxelDownsamplingBackend(): VoxelDownsamplingBackend {
    return this._voxelDownsamplingBackend;
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
    this._voxelDownsampling.dispose();
    this._voxelDownsamplingBackend.dispose();
    this.removeAllObservers();
  }
}
