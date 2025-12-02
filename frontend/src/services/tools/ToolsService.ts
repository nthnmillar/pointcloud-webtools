import { BaseService } from '../BaseService';
import type { ServiceManager } from '../ServiceManager';
import { Log } from '../../utils/Log';
import { VoxelDownsampleService } from './VoxelDownsampling/VoxelDownsampleService';
import { PointCloudSmoothingService } from './PointCloudSmoothing/PointCloudSmoothingService';
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
  private serviceManager: ServiceManager;

  // Individual tool services
  public voxelDownsampleService: VoxelDownsampleService;
  public pointCloudSmoothingService: PointCloudSmoothingService;
  public voxelDownsampleDebugService: VoxelDownsampleDebugService;

  constructor(serviceManager: ServiceManager) {
    super();
    this.serviceManager = serviceManager;

    // Initialize individual tool services
    this.voxelDownsampleService = new VoxelDownsampleService(serviceManager);
    this.pointCloudSmoothingService = new PointCloudSmoothingService(
      serviceManager
    );
    this.voxelDownsampleDebugService = new VoxelDownsampleDebugService(
      serviceManager
    );
  }

  async initialize(): Promise<void> {
    // Initialize all individual tool services - NO FALLBACKS
    const initPromises = [
      this.voxelDownsampleService.initialize(),
      this.pointCloudSmoothingService.initialize(),
      this.voxelDownsampleDebugService.initialize(),
    ];

    await Promise.all(initPromises);

    this.isInitialized = true;
    Log.Info('ToolsService', 'ToolsService initialized successfully');
  }

  // Voxel downsampling methods
  async voxelDownsampleWASM(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsamplingWASMCPP.voxelDownsample(
      params
    );
  }

  async performVoxelDownsamplingWASMCPP(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleWASM(params);
  }

  async performVoxelDownsamplingRustWasmMain(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleWASMRust(params);
  }

  async performPointCloudSmoothingRustWasmMain(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.performPointCloudSmoothingWASMRust(params);
  }

  async voxelDownsampleWASMRust(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsampleWASMRust(params);
  }

  async voxelDownsampleTS(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsamplingTS.voxelDownsample(
      params
    );
  }

  async voxelDownsampleBackend(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsamplingBECPP.voxelDownsample(
      params
    );
  }

  async voxelDownsampleBERust(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsamplingBERust.voxelDownsample(
      params
    );
  }

  async voxelDownsampleBEPython(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    return this.voxelDownsampleService.voxelDownsampleBEPython(params);
  }

  // Point cloud smoothing methods
  async performPointCloudSmoothingWASMCPP(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingService.performPointCloudSmoothingWASMCPP(
      params
    );
  }

  async performPointCloudSmoothingWASMRust(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingService.performPointCloudSmoothingWASMRust(
      params
    );
  }

  async performPointCloudSmoothingTS(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingService.performPointCloudSmoothingTS(params);
  }

  async performPointCloudSmoothingBECPP(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingService.performPointCloudSmoothingBECPP(
      params
    );
  }

  async performPointCloudSmoothingBERust(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingService.performPointCloudSmoothingBERust(
      params
    );
  }

  async performPointCloudSmoothingBEPython(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    return this.pointCloudSmoothingService.performPointCloudSmoothingBEPython(
      params
    );
  }

  // Voxel debug methods
  async showVoxelDebug(
    voxelSize: number,
    implementation?:
      | 'TS'
      | 'WASM'
      | 'WASM_MAIN'
      | 'WASM_RUST'
      | 'RUST_WASM_MAIN'
      | 'BE'
      | 'BE_RUST'
      | 'BE_PYTHON',
    maxVoxels?: number
  ): Promise<{ voxelCount: number; processingTime: number } | null> {
    // Clear any existing debug visualization first
    this.hideVoxelDebug();

    if (!this.voxelDownsampleService.voxelDownsampleDebug) {
      Log.Error('ToolsService', 'Voxel debug service not available');
      throw new Error('Voxel debug service not available');
    }

    // Set the implementation for future updates
    const currentImplementation = implementation || 'TS';
    this.voxelDownsampleService.voxelDownsampleDebug.setImplementation(
      currentImplementation
    );

    try {
      // Use collectAllPoints to get point data directly (handles both points and positions arrays)
      // This ensures all implementations get the same data
      const { collectAllPoints } = await import(
        '../../components/tools/ToolsUtils'
      );
      const pointData = collectAllPoints(this.serviceManager);

      if (!pointData) {
        Log.Warn(
          'ToolsService',
          'No point clouds available for debug visualization'
        );
        throw new Error('No point clouds available for debug visualization');
      }

      const pointCloudData = pointData.pointCloudData;
      const globalBounds = pointData.globalBounds;

      Log.Info('ToolsService', 'Debug voxel generation started', {
        implementation: implementation || 'TS',
        voxelSize,
        pointCount: pointCloudData.length / 3,
      });

      Log.Info('ToolsService', 'Point cloud data prepared', {
        implementation: implementation || 'TS',
        pointCount: pointCloudData.length / 3,
        bounds: globalBounds,
        voxelSize,
        firstPoint:
          pointCloudData.length >= 3
            ? {
                x: pointCloudData[0],
                y: pointCloudData[1],
                z: pointCloudData[2],
              }
            : null,
        lastPoint:
          pointCloudData.length >= 3
            ? {
                x: pointCloudData[pointCloudData.length - 3],
                y: pointCloudData[pointCloudData.length - 2],
                z: pointCloudData[pointCloudData.length - 1],
              }
            : null,
      });

      // Use the appropriate implementation
      const result =
        await this.voxelDownsampleDebugService.generateVoxelCenters(
          {
            pointCloudData,
            voxelSize,
            globalBounds,
          },
          implementation || 'TS'
        );

      Log.Info('ToolsService', 'Debug voxel generation result', {
        success: result.success,
        voxelCount: result.voxelCount,
        processingTime: result.processingTime,
        error: result.error,
      });

      if (
        result.success &&
        (result.voxelCenters || result.voxelGridPositions)
      ) {
        // Create debug visualization with generated centers
        const voxelCenters = result.voxelCenters || result.voxelGridPositions;
        if (!voxelCenters) {
          throw new Error('No voxel centers available for visualization');
        }
        Log.Info('ToolsService', 'Creating debug visualization', {
          voxelCentersLength: voxelCenters.length,
          voxelSize,
          firstFewCenters: Array.from(voxelCenters.slice(0, 9)), // First 3 centers (9 values)
        });

        // Set colors to match button colors exactly
        let color = { r: 0 / 255, g: 100 / 255, b: 200 / 255 }; // Default to TS darker blue
        if (implementation === 'WASM') {
          // Light blue/cyan to match .tools-wasm-btn: rgba(97, 218, 251, 0.8)
          color = { r: 97 / 255, g: 218 / 255, b: 251 / 255 };
        } else if (implementation === 'WASM_MAIN') {
          // Green to match .tools-wasm-main-btn: rgba(50, 205, 50, 0.8)
          color = { r: 50 / 255, g: 205 / 255, b: 50 / 255 };
        } else if (implementation === 'WASM_RUST') {
          // Orange/red to match .tools-wasm-rust-btn: rgba(255, 99, 71, 0.8)
          color = { r: 255 / 255, g: 99 / 255, b: 71 / 255 };
        } else if (implementation === 'RUST_WASM_MAIN') {
          // Darker orange/red to match .tools-rust-wasm-main-btn: rgba(255, 69, 0, 0.8)
          color = { r: 255 / 255, g: 69 / 255, b: 0 / 255 };
        } else if (implementation === 'BE') {
          // Orange to match .tools-be-btn: rgba(255, 165, 0, 0.8)
          color = { r: 255 / 255, g: 165 / 255, b: 0 / 255 };
        } else if (implementation === 'BE_RUST') {
          // Light blue/cyan to match .tools-be-rust-btn: rgba(97, 218, 251, 0.8)
          color = { r: 97 / 255, g: 218 / 255, b: 251 / 255 };
        } else if (implementation === 'BE_PYTHON') {
          // Green to match .tools-be-python-btn: rgba(50, 205, 50, 0.8)
          color = { r: 50 / 255, g: 205 / 255, b: 50 / 255 };
        }
        // TS is the default (darker blue color)

        // Set the color for future updates
        this.voxelDownsampleService.voxelDownsampleDebug?.setColor(color);

        this.voxelDownsampleService.voxelDownsampleDebug?.showVoxelDebugWithCenters(
          voxelCenters,
          voxelSize,
          color,
          maxVoxels
        );
        Log.Info(
          'ToolsService',
          `${implementation || 'TS'} debug voxel generation completed`,
          {
            voxelCount: result.voxelCount,
            processingTime: result.processingTime?.toFixed(2) + 'ms',
            color,
          }
        );

        // Return the result for benchmarking
        return {
          voxelCount: result.voxelCount || 0,
          processingTime: result.processingTime || 0,
        };
      } else {
        Log.Error(
          'ToolsService',
          `${implementation || 'TS'} debug voxel generation failed`,
          result.error
        );
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
      this.voxelDownsampleService.voxelDownsampleDebug.updateVoxelSize(
        newVoxelSize
      );
    }
  }

  get processing(): boolean {
    return this.isProcessing;
  }

  dispose(): void {
    this.voxelDownsampleService?.dispose();
    this.pointCloudSmoothingService?.dispose();
    this.removeAllObservers();
  }
}
