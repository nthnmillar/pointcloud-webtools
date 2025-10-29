import { BaseService } from '../BaseService';
import type { ServiceManager } from '../ServiceManager';
import { Log } from '../../utils/Log';
import { VoxelDownsampleService } from './VoxelDownsampling/VoxelDownsampleService';
import { VoxelDownsamplingBEPython } from './VoxelDownsampling/VoxelDownsamplingBEPython';
import { PointCloudSmoothingWASMCPP } from './PointCloudSmoothing/PointCloudSmoothingWASMCPP';
import { PointCloudSmoothingWASMRust } from './PointCloudSmoothing/PointCloudSmoothingWASMRust';
import { PointCloudSmoothingTS } from './PointCloudSmoothing/PointCloudSmoothingTS';
import { PointCloudSmoothingBECPP } from './PointCloudSmoothing/PointCloudSmoothingBECPP';
import { PointCloudSmoothingBERust } from './PointCloudSmoothing/PointCloudSmoothingBERust';
import { VoxelDownsampleDebugService } from './VoxelDownsampleDebug/VoxelDownsampleDebugService';

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
  private voxelDownsamplingBEPython: VoxelDownsamplingBEPython;
  private pointCloudSmoothingWASMCPP: PointCloudSmoothingWASMCPP;
  private pointCloudSmoothingWASMRust: PointCloudSmoothingWASMRust;
  private pointCloudSmoothingTS: PointCloudSmoothingTS;
  private pointCloudSmoothingBECPP: PointCloudSmoothingBECPP;
  private pointCloudSmoothingBERust: PointCloudSmoothingBERust;
  public voxelDownsampleDebugService: VoxelDownsampleDebugService;

  constructor(serviceManager: ServiceManager) {
    super();
    
    // Initialize individual tool services
    this.voxelDownsampleService = new VoxelDownsampleService(serviceManager);
    this.voxelDownsamplingBEPython = new VoxelDownsamplingBEPython();
    this.pointCloudSmoothingWASMCPP = new PointCloudSmoothingWASMCPP(serviceManager);
    this.pointCloudSmoothingWASMRust = new PointCloudSmoothingWASMRust(serviceManager);
    this.pointCloudSmoothingTS = new PointCloudSmoothingTS(serviceManager);
    this.pointCloudSmoothingBECPP = new PointCloudSmoothingBECPP();
    this.pointCloudSmoothingBERust = new PointCloudSmoothingBERust();
    this.voxelDownsampleDebugService = new VoxelDownsampleDebugService(serviceManager);
  }

  async initialize(): Promise<void> {
    // Initialize all individual tool services - NO FALLBACKS
    const initPromises = [
      this.voxelDownsampleService.initialize(),
      this.pointCloudSmoothingWASMCPP.initialize(),
      this.pointCloudSmoothingWASMRust.initialize(),
      this.pointCloudSmoothingTS.initialize(),
      this.pointCloudSmoothingBECPP.initialize(),
      this.voxelDownsampleDebugService.initialize()
    ];
    
    await Promise.all(initPromises);
    
    this.isInitialized = true;
    Log.Info('ToolsService', 'ToolsService initialized successfully');
  }

  // Voxel downsampling methods
  async voxelDownsampleWASM(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsamplingWASMCPP.voxelDownsample(params);
  }

  async performVoxelDownsamplingWASMCPP(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleWASM(params);
  }

  async performVoxelDownsamplingRustWasmMain(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleWASMRust(params);
  }

  async performPointCloudSmoothingRustWasmMain(params: PointCloudSmoothingParams): Promise<PointCloudSmoothingResult> {
    return this.performPointCloudSmoothingWASMRust(params);
  }

  async voxelDownsampleWASMRust(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsampleWASMRust(params);
  }

  async voxelDownsampleTS(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsamplingTS.voxelDownsample(params);
  }

  async voxelDownsampleBackend(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsamplingBECPP.voxelDownsample(params);
  }

  async voxelDownsampleBERust(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsamplingBERust.voxelDownsample(params);
  }

  async voxelDownsampleBEPython(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    const result = await this.voxelDownsamplingBEPython.performVoxelDownsampling({
      pointCloudData: params.pointCloudData,
      voxelSize: params.voxelSize,
      globalBounds: params.globalBounds
    });
    
    return {
      success: result.success,
      downsampledPoints: result.downsampledPoints,
      originalCount: result.originalCount,
      downsampledCount: result.downsampledCount,
      processingTime: result.processingTime,
      voxelCount: result.voxelCount
    };
  }

  // Point cloud smoothing methods
  async performPointCloudSmoothingWASMCPP(params: PointCloudSmoothingParams): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingWASMCPP.pointCloudSmoothing(params);
  }

  async performPointCloudSmoothingWASMRust(params: PointCloudSmoothingParams): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingWASMRust.performPointCloudSmoothing(
      params.points,
      params.smoothingRadius,
      params.iterations
    );
  }

  async performPointCloudSmoothingTS(params: PointCloudSmoothingParams): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingTS.pointCloudSmoothing(params);
  }

  async performPointCloudSmoothingBECPP(params: PointCloudSmoothingParams): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingBECPP.pointCloudSmooth({
      pointCloudData: params.points,
      smoothingRadius: params.smoothingRadius,
      iterations: params.iterations
    });
  }

  async performPointCloudSmoothingBERust(params: PointCloudSmoothingParams): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingBERust.pointCloudSmooth(params);
  }

  // Voxel debug methods
  async showVoxelDebug(voxelSize: number, implementation?: 'TS' | 'WASM' | 'WASM_MAIN' | 'WASM_RUST' | 'RUST_WASM_MAIN' | 'BE' | 'BE_RUST' | 'BE_PYTHON', maxVoxels?: number): Promise<{ voxelCount: number; processingTime: number } | null> {
    
    // Clear any existing debug visualization first
    this.hideVoxelDebug();
    
    if (!this.voxelDownsampleService.voxelDownsampleDebug) {
      console.error('❌ Voxel debug service not available');
      Log.Error('ToolsService', 'Voxel debug service not available');
      throw new Error('Voxel debug service not available');
    }

    // Set the implementation for future updates
    const currentImplementation = implementation || 'TS';
    this.voxelDownsampleService.voxelDownsampleDebug.setImplementation(currentImplementation);

    try {
      // Get current point clouds
      const pointClouds = this.voxelDownsampleService.voxelDownsampleDebug.getCurrentPointClouds();
      
      Log.Info('ToolsService', 'Debug voxel generation started', {
        implementation: implementation || 'TS',
        voxelSize,
        pointCloudCount: pointClouds?.length || 0
      });

      if (!pointClouds || pointClouds.length === 0) {
        console.warn('⚠️ No point clouds available for debug visualization');
        Log.Warn('ToolsService', 'No point clouds available for debug visualization');
        throw new Error('No point clouds available for debug visualization');
      }

      // Convert to Float32Array
      const allPositions: number[] = [];
      let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
      let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

      for (const cloud of pointClouds) {
        for (const point of cloud.points) {
          allPositions.push(point.position.x, point.position.y, point.position.z);
          
          globalMinX = Math.min(globalMinX, point.position.x);
          globalMinY = Math.min(globalMinY, point.position.y);
          globalMinZ = Math.min(globalMinZ, point.position.z);
          globalMaxX = Math.max(globalMaxX, point.position.x);
          globalMaxY = Math.max(globalMaxY, point.position.y);
          globalMaxZ = Math.max(globalMaxZ, point.position.z);
        }
      }

      const pointCloudData = new Float32Array(allPositions);
      
      Log.Info('ToolsService', 'Point cloud data prepared', {
        pointCount: pointCloudData.length / 3,
        bounds: { globalMinX, globalMinY, globalMinZ, globalMaxX, globalMaxY, globalMaxZ }
      });
      
      // Use the appropriate implementation
      const result = await this.voxelDownsampleDebugService.generateVoxelCenters({
        pointCloudData,
        voxelSize,
        globalBounds: {
          minX: globalMinX,
          minY: globalMinY,
          minZ: globalMinZ,
          maxX: globalMaxX,
          maxY: globalMaxY,
          maxZ: globalMaxZ
        }
      }, implementation || 'TS');

      Log.Info('ToolsService', 'Debug voxel generation result', {
        success: result.success,
        voxelCount: result.voxelCount,
        processingTime: result.processingTime,
        error: result.error
      });

      if (result.success && (result.voxelCenters || result.voxelGridPositions)) {
        // Create debug visualization with generated centers
        const voxelCenters = result.voxelCenters || result.voxelGridPositions;
        if (!voxelCenters) {
          throw new Error('No voxel centers available for visualization');
        }
        Log.Info('ToolsService', 'Creating debug visualization', {
          voxelCentersLength: voxelCenters.length,
          voxelSize,
          firstFewCenters: Array.from(voxelCenters.slice(0, 9)) // First 3 centers (9 values)
        });
        
        // Set colors to match button colors exactly
        let color = { r: 0/255, g: 100/255, b: 200/255 }; // Default to TS darker blue
        if (implementation === 'WASM') {
          // Light blue/cyan to match .tools-wasm-btn: rgba(97, 218, 251, 0.8)
          color = { r: 97/255, g: 218/255, b: 251/255 };
        } else if (implementation === 'WASM_MAIN') {
          // Green to match .tools-wasm-main-btn: rgba(50, 205, 50, 0.8)
          color = { r: 50/255, g: 205/255, b: 50/255 };
        } else if (implementation === 'WASM_RUST') {
          // Orange/red to match .tools-wasm-rust-btn: rgba(255, 99, 71, 0.8)
          color = { r: 255/255, g: 99/255, b: 71/255 };
        } else if (implementation === 'RUST_WASM_MAIN') {
          // Darker orange/red to match .tools-rust-wasm-main-btn: rgba(255, 69, 0, 0.8)
          color = { r: 255/255, g: 69/255, b: 0/255 };
        } else if (implementation === 'BE') {
          // Orange to match .tools-be-btn: rgba(255, 165, 0, 0.8)
          color = { r: 255/255, g: 165/255, b: 0/255 };
        } else if (implementation === 'BE_RUST') {
          // Light blue/cyan to match .tools-be-rust-btn: rgba(97, 218, 251, 0.8)
          color = { r: 97/255, g: 218/255, b: 251/255 };
        } else if (implementation === 'BE_PYTHON') {
          // Green to match .tools-be-python-btn: rgba(50, 205, 50, 0.8)
          color = { r: 50/255, g: 205/255, b: 50/255 };
        }
        // TS is the default (darker blue color)
        
        // Set the color for future updates
        this.voxelDownsampleService.voxelDownsampleDebug?.setColor(color);
        
        this.voxelDownsampleService.voxelDownsampleDebug?.showVoxelDebugWithCenters(voxelCenters, voxelSize, color, maxVoxels);
        Log.Info('ToolsService', `${implementation || 'TS'} debug voxel generation completed`, {
          voxelCount: result.voxelCount,
          processingTime: result.processingTime?.toFixed(2) + 'ms',
          color
        });
        
        // Return the result for benchmarking
        return {
          voxelCount: result.voxelCount || 0,
          processingTime: result.processingTime || 0
        };
      } else {
        Log.Error('ToolsService', `${implementation || 'TS'} debug voxel generation failed`, result.error);
        throw new Error(`Debug voxel generation failed: ${result.error}`);
      }
    } catch (error) {
      Log.Error('ToolsService', 'Debug voxel generation failed', error);
      throw error;
    }
  }

  hideVoxelDebug(): void {
    this.voxelDownsampleService.voxelDownsampleDebug?.hideVoxelDebug();
  }

  // Update voxel size of existing debug visualization
  updateVoxelSize(newVoxelSize: number): void {
    if (this.voxelDownsampleService.voxelDownsampleDebug) {
      this.voxelDownsampleService.voxelDownsampleDebug.updateVoxelSize(newVoxelSize);
    }
  }

  get processing(): boolean {
    return this.isProcessing;
  }

  dispose(): void {
    this.voxelDownsampleService?.dispose();
    this.pointCloudSmoothingWASMCPP?.dispose();
    this.pointCloudSmoothingWASMRust?.dispose();
    this.pointCloudSmoothingTS?.dispose();
    this.pointCloudSmoothingBECPP?.dispose();
    this.removeAllObservers();
  }
}