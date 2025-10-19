import { BaseService } from '../BaseService';
import type { ServiceManager } from '../ServiceManager';
import { Log } from '../../utils/Log';
import { WasmBufferManager } from './WasmBufferManager';

export interface WasmFirstProcessingParams {
  pointCloudId: string;
  operation: 'smooth' | 'voxelDownsample';
  params: {
    smoothingRadius?: number;
    iterations?: number;
    voxelSize?: number;
  };
}

export interface WasmFirstProcessingResult {
  success: boolean;
  processedPoints?: Float32Array;
  originalCount?: number;
  processedCount?: number;
  processingTime?: number;
  error?: string;
}

/**
 * WASM-First Service - Implements the WASM-first architecture
 * 
 * Architecture:
 * - WASM Buffer Manager is the source of truth for all point data
 * - TS only handles UI/visualization
 * - All processing happens directly on WASM memory (zero-copy)
 * 
 * Flow:
 * 1. LAZ-perf → WasmBufferManager.storePointCloud() (source of truth)
 * 2. TS Babylon → WasmBufferManager.getPointDataForVisualization() (read-only)
 * 3. Tools → WasmBufferManager.processPointCloud() (zero-copy processing)
 * 4. Results → Babylon visualization (processed points)
 */
export class WasmFirstService extends BaseService {
  private wasmBufferManager: WasmBufferManager;
  private wasmModule: any = null;

  constructor(serviceManager: ServiceManager) {
    super();
    this.wasmBufferManager = new WasmBufferManager();
    Log.Info('WasmFirstService', 'WASM-First Service created - Source of Truth Architecture');
    // Note: serviceManager is stored for potential future use
    void serviceManager;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      Log.Info('WasmFirstService', 'Already initialized, skipping');
      return;
    }

    Log.Info('WasmFirstService', 'Starting initialization...');

    try {
      // Initialize WASM module
      Log.Info('WasmFirstService', 'Loading WASM module...');
      const ToolsModule = await import('../../../public/wasm/cpp/tools_cpp.js');
      Log.Info('WasmFirstService', 'WASM module loaded, checking exports...', {
        hasDefault: 'default' in ToolsModule,
        hasToolsModule: 'ToolsModule' in ToolsModule,
        exports: Object.keys(ToolsModule)
      });
      
      // Try different ways to get the module
      let moduleFactory;
      if (ToolsModule.default) {
        moduleFactory = ToolsModule.default;
        Log.Info('WasmFirstService', 'Using ToolsModule.default');
      } else if (ToolsModule.ToolsModule) {
        moduleFactory = ToolsModule.ToolsModule;
        Log.Info('WasmFirstService', 'Using ToolsModule.ToolsModule');
      } else {
        throw new Error('Could not find WASM module factory function');
      }
      
      Log.Info('WasmFirstService', 'WASM module factory found, initializing...');
      this.wasmModule = await moduleFactory();
      Log.Info('WasmFirstService', 'WASM module initialized successfully');
      
      // Initialize WASM Buffer Manager
      Log.Info('WasmFirstService', 'Initializing WASM Buffer Manager...');
      await this.wasmBufferManager.initialize(this.wasmModule);
      Log.Info('WasmFirstService', 'WASM Buffer Manager initialized successfully');
      
      this.isInitialized = true;
      Log.Info('WasmFirstService', 'WASM-First Service initialized - Ready for zero-copy processing');
    } catch (error) {
      Log.Error('WasmFirstService', 'Failed to initialize WASM-First service:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Store point cloud data in WASM buffer (source of truth)
   * Called by LAZ-perf loader
   */
  async storePointCloud(
    id: string,
    points: Float32Array,
    metadata: any
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('WasmFirstService not initialized');
    }

    await this.wasmBufferManager.storePointCloud(id, points, metadata);
    
    Log.Info('WasmFirstService', 'Point cloud stored in WASM buffer (source of truth)', {
      id,
      pointCount: points.length / 3,
      memoryMB: ((points.length * 4) / 1024 / 1024).toFixed(2)
    });
  }

  /**
   * Get point data for visualization (read-only access)
   * Called by TS Babylon visualization
   */
  getPointDataForVisualization(id: string): {
    points: Float32Array;
    pointCount: number;
    bounds: any;
    metadata: any;
  } | null {
    return this.wasmBufferManager.getPointDataForVisualization(id);
  }

  /**
   * Process point cloud using WASM buffer (zero-copy)
   * Called by tools when user changes settings
   */
  async processPointCloud(params: WasmFirstProcessingParams): Promise<WasmFirstProcessingResult> {
    if (!this.isInitialized) {
      Log.Error('WasmFirstService', 'Service not initialized');
      return {
        success: false,
        error: 'Service not initialized'
      };
    }

    const startTime = performance.now();

    try {
      Log.Info('WasmFirstService', 'Starting WASM-first processing (zero-copy)', {
        pointCloudId: params.pointCloudId,
        operation: params.operation,
        params: params.params
      });

      // Get WASM buffer info
      const buffer = this.wasmBufferManager.getWasmBuffer(params.pointCloudId);
      if (!buffer) {
        return {
          success: false,
          error: `Point cloud not found in WASM buffer: ${params.pointCloudId}`
        };
      }

      // Process using WASM buffer (zero-copy)
      const processedPoints = await this.wasmBufferManager.processPointCloud(
        params.pointCloudId,
        params.operation,
        {
          ...params.params,
          processingTime: performance.now() - startTime
        }
      );

      if (!processedPoints) {
        return {
          success: false,
          error: 'WASM processing failed'
        };
      }

      const processingTime = performance.now() - startTime;

      Log.Info('WasmFirstService', 'WASM-first processing completed (zero-copy)', {
        pointCloudId: params.pointCloudId,
        operation: params.operation,
        originalCount: buffer.pointCount,
        processedCount: processedPoints.length / 3,
        processingTime: `${processingTime.toFixed(2)}ms`,
        speedup: 'Zero-copy processing (no data transfer overhead)'
      });

      return {
        success: true,
        processedPoints,
        originalCount: buffer.pointCount,
        processedCount: processedPoints.length / 3,
        processingTime
      };
    } catch (error) {
      const processingTime = performance.now() - startTime;
      Log.Error('WasmFirstService', 'WASM-first processing failed', error);
      
      return {
        success: false,
        originalCount: 0,
        processedCount: 0,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get processed result for visualization
   * Called by Babylon to get the latest processed points
   */
  getProcessedResult(id: string): Float32Array | null {
    return this.wasmBufferManager.getProcessedResult(id);
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): any {
    return this.wasmBufferManager.getMemoryStats();
  }

  /**
   * Get stored point cloud IDs
   */
  getStoredIds(): string[] {
    const ids = this.wasmBufferManager.getStoredIds();
    Log.Debug('WasmFirstService', 'Getting stored point cloud IDs', {
      ids,
      count: ids.length,
      isInitialized: this.isInitialized
    });
    return ids;
  }

  /**
   * Remove point cloud from WASM buffer
   */
  removePointCloud(id: string): void {
    this.wasmBufferManager.removePointCloud(id);
  }

  dispose(): void {
    this.wasmBufferManager.dispose();
    this.wasmModule = null;
    this.removeAllObservers();
    Log.Info('WasmFirstService', 'WASM-First Service disposed');
  }
}
