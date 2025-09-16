import { BaseService } from '../BaseService';
import { VoxelDownsampling } from './VoxelDownsampling';

export class ToolsService extends BaseService {
  private _voxelDownsampling: VoxelDownsampling;

  constructor() {
    super();
    this._voxelDownsampling = new VoxelDownsampling(this);
  }

  async initialize(): Promise<void> {
    await this._voxelDownsampling.initialize();
    this.isInitialized = true;
  }


  // Generic tool access
  get voxelDownsampling(): VoxelDownsampling {
    return this._voxelDownsampling;
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
    this.removeAllObservers();
  }
}
