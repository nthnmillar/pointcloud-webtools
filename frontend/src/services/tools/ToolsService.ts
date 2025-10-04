import { BaseService } from '../BaseService';
import type { ServiceManager } from '../ServiceManager';
import { Log } from '../../utils/Log';
import { VoxelDownsampleService } from './VoxelDownsampling/VoxelDownsampleService';
import { PointCloudSmoothingWASM } from './PointCloudSmoothing/PointCloudSmoothingWASM';
import { PointCloudSmoothingTS } from './PointCloudSmoothing/PointCloudSmoothingTS';
import { PointCloudSmoothingBackend } from './PointCloudSmoothing/PointCloudSmoothingBackend';

export interface VoxelDownsampleParams {
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

export interface VoxelDownsampleResult {
  success: boolean;
  downsampledPoints?: Float32Array;
  originalCount?: number;
  downsampledCount?: number;
  processingTime?: number;
  voxelCount?: number;
  error?: string;
}

export interface PointCloudSmoothingParams {
  points: Float32Array;
  smoothingRadius: number;
  iterations: number;
}

export interface PointCloudSmoothingResult {
  success: boolean;
  smoothedPoints?: Float32Array;
  originalCount?: number;
  smoothedCount?: number;
  processingTime?: number;
  error?: string;
}

export class ToolsService extends BaseService {
  private isProcessing = false;
  
  // Individual tool services
  public voxelDownsampleService: VoxelDownsampleService;
  private pointCloudSmoothingWASM: PointCloudSmoothingWASM;
  private pointCloudSmoothingTS: PointCloudSmoothingTS;
  private pointCloudSmoothingBackend: PointCloudSmoothingBackend;

  constructor(serviceManager: ServiceManager) {
    super();
    
    // Initialize individual tool services
    this.voxelDownsampleService = new VoxelDownsampleService(serviceManager);
    this.pointCloudSmoothingWASM = new PointCloudSmoothingWASM(serviceManager);
    this.pointCloudSmoothingTS = new PointCloudSmoothingTS(serviceManager);
    this.pointCloudSmoothingBackend = new PointCloudSmoothingBackend(serviceManager);
  }

  async initialize(): Promise<void> {
    try {
      // Initialize all individual tool services with error handling
      const initPromises = [
        this.voxelDownsampleService.initialize().catch(err => {
          Log.Error('ToolsService', 'VoxelDownsampleService initialization failed:', err);
          return null;
        }),
        this.pointCloudSmoothingWASM.initialize().catch(err => {
          Log.Error('ToolsService', 'PointCloudSmoothingWASM initialization failed:', err);
          return null;
        }),
        this.pointCloudSmoothingTS.initialize().catch(err => {
          Log.Error('ToolsService', 'PointCloudSmoothingTS initialization failed:', err);
          return null;
        }),
        this.pointCloudSmoothingBackend.initialize().catch(err => {
          Log.Error('ToolsService', 'PointCloudSmoothingBackend initialization failed:', err);
          return null;
        })
      ];
      
      await Promise.all(initPromises);
      
      this.isInitialized = true;
      Log.Info('ToolsService', 'ToolsService initialized successfully');
    } catch (error) {
      Log.Error('ToolsService', 'ToolsService initialization failed:', error);
      // Don't throw the error, just log it and continue
      this.isInitialized = true;
    }
  }

  // Voxel downsampling methods
  async voxelDownsampleWASM(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsamplingWASM.voxelDownsample(params);
  }

  async voxelDownsampleTS(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsamplingTS.voxelDownsample(params);
  }

  async voxelDownsampleBackend(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsamplingBackend.voxelDownsample(params);
  }

  // Point cloud smoothing methods
  async performPointCloudSmoothingWASM(params: PointCloudSmoothingParams): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingWASM.pointCloudSmoothing(params);
  }

  async performPointCloudSmoothingTS(params: PointCloudSmoothingParams): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingTS.pointCloudSmoothing(params);
  }

  async performPointCloudSmoothingBackend(params: PointCloudSmoothingParams): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingBackend.pointCloudSmoothing(params);
  }

  // Voxel debug methods
  showVoxelDebug(voxelSize: number): void {
    this.voxelDownsampleService.voxelDownsampleDebug?.showVoxelDebugWithSize(voxelSize);
  }

  hideVoxelDebug(): void {
    this.voxelDownsampleService.voxelDownsampleDebug?.hideVoxelDebug();
  }

  get processing(): boolean {
    return this.isProcessing;
  }

  dispose(): void {
    this.voxelDownsampleService?.dispose();
    this.pointCloudSmoothingWASM?.dispose();
    this.pointCloudSmoothingTS?.dispose();
    this.pointCloudSmoothingBackend?.dispose();
    this.removeAllObservers();
  }
}