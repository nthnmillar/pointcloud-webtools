import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';
import { VoxelDownsampleDebugTS } from './VoxelDownsampleDebugTS';
import { VoxelDownsampleDebugWASM } from './VoxelDownsampleDebugWASM';
import { VoxelDownsampleDebugBackend } from './VoxelDownsampleDebugBackend';

export interface VoxelDebugParams {
  pointCloudData: Float32Array;
  voxelSize: number;
  globalBounds: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  };
}

export interface VoxelDebugResult {
  success: boolean;
  voxelCenters?: Float32Array;
  voxelCount?: number;
  processingTime?: number;
  error?: string;
}

export class VoxelDownsampleDebugService extends BaseService {
  public voxelDownsampleDebugTS: VoxelDownsampleDebugTS;
  public voxelDownsampleDebugWASM: VoxelDownsampleDebugWASM;
  public voxelDownsampleDebugBackend: VoxelDownsampleDebugBackend;

  constructor(serviceManager: ServiceManager) {
    super();
    this.voxelDownsampleDebugTS = new VoxelDownsampleDebugTS(serviceManager);
    this.voxelDownsampleDebugWASM = new VoxelDownsampleDebugWASM(serviceManager);
    this.voxelDownsampleDebugBackend = new VoxelDownsampleDebugBackend(serviceManager);
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.voxelDownsampleDebugTS.initialize(),
      this.voxelDownsampleDebugWASM.initialize(),
      this.voxelDownsampleDebugBackend.initialize()
    ]);
    this.isInitialized = true;
  }

  async generateVoxelCenters(params: VoxelDebugParams, implementation: 'TS' | 'WASM' | 'BE'): Promise<VoxelDebugResult> {
    try {
      let result: VoxelDebugResult;
      
      switch (implementation) {
        case 'TS':
          result = await this.voxelDownsampleDebugTS.generateVoxelCenters(params);
          break;
        case 'WASM':
          result = await this.voxelDownsampleDebugWASM.generateVoxelCenters(params);
          break;
        case 'BE':
          result = await this.voxelDownsampleDebugBackend.generateVoxelCenters(params);
          break;
        default:
          throw new Error(`Unknown implementation: ${implementation}`);
      }

      Log.Info('VoxelDownsampleDebugService', `${implementation} voxel centers generated`, {
        success: result.success,
        voxelCount: result.voxelCount,
        processingTime: result.processingTime?.toFixed(2) + 'ms'
      });

      return result;
    } catch (error) {
      Log.Error('VoxelDownsampleDebugService', `${implementation} voxel centers generation failed`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  dispose(): void {
    this.voxelDownsampleDebugTS.dispose();
    this.voxelDownsampleDebugWASM.dispose();
    this.voxelDownsampleDebugBackend.dispose();
    this.removeAllObservers();
  }
}
