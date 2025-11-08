import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';

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

export class VoxelDownsamplingWASMCPP extends BaseService {
  private module: any = null;
  private _serviceManager: ServiceManager;

  constructor(serviceManager: ServiceManager) {
    super();
    this._serviceManager = serviceManager;
  }

  async initialize(): Promise<void> {
    try {
      Log.Info('VoxelDownsamplingWASM', 'Starting WASM initialization...');
      
      // Load the unified WASM module
      const toolsPath = new URL('/wasm/cpp/tools_cpp.js', self.location.origin);
      Log.Info('VoxelDownsamplingWASM', 'Fetching WASM JS from:', toolsPath.href);
      
      const response = await fetch(toolsPath.href);
      if (!response.ok) {
        throw new Error(`Failed to fetch WASM JS: ${response.status} ${response.statusText}`);
      }
      
      const jsCode = await response.text();
      Log.Info('VoxelDownsamplingWASM', 'WASM JS code loaded, length:', jsCode.length);
      
      // Create a function from the WASM code - handle Emscripten format
      Log.Info('VoxelDownsamplingWASM', 'Creating WASM function...');
      const wasmFunction = new Function(jsCode + '; return ToolsModule;')();
      
      Log.Info('VoxelDownsamplingWASM', 'Calling WASM function with locateFile...');
      this.module = await wasmFunction({
        locateFile: (path: string) => {
          Log.Info('VoxelDownsamplingWASM', 'locateFile called with path:', path);
          if (path.endsWith('.wasm')) {
            const wasmUrl = new URL('/wasm/cpp/tools_cpp.wasm', self.location.origin).href;
            Log.Info('VoxelDownsamplingWASM', 'Resolved WASM URL:', wasmUrl);
            return wasmUrl;
          }
          return path;
        },
      });
      
      Log.Info('VoxelDownsamplingWASM', 'WASM module loaded successfully');
      this.isInitialized = true;
    } catch (error) {
      Log.Error('VoxelDownsamplingWASM', 'Failed to initialize WASM module:', error);
      throw error;
    }
  }

  async voxelDownsample(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    if (!this.isInitialized || !this.module) {
      Log.Error('VoxelDownsamplingWASM', 'WASM module not available');
      return {
        success: false,
        error: 'WASM module not available'
      };
    }

    try {
      const startTime = performance.now();
      
      // Check if required functions are available
      if (!this.module._malloc || !this.module._free || !this.module.ccall || !this.module.HEAPF32) {
        throw new Error('Required WASM functions not available. Missing: ' + 
          (!this.module._malloc ? '_malloc ' : '') +
          (!this.module._free ? '_free ' : '') +
          (!this.module.ccall ? 'ccall ' : '') +
          (!this.module.HEAPF32 ? 'HEAPF32' : ''));
      }
      
      const pointCount = params.pointCloudData.length / 3;
      const floatCount = params.pointCloudData.length;
      
      // Allocate memory in WASM heap for input and output
      const inputPtr = this.module._malloc(floatCount * 4); // 4 bytes per float
      const outputPtr = this.module._malloc(floatCount * 4); // Pre-allocate output buffer (worst case: same size as input)
      
      if (!inputPtr || !outputPtr) {
        throw new Error(`Failed to allocate WASM memory: inputPtr=${inputPtr}, outputPtr=${outputPtr}`);
      }
      
      try {
        // OPTIMIZATION: Bulk copy input data using HEAPF32.set()
        // This is much faster than element-by-element copy
        const inputFloatIndex = inputPtr >> 2; // Convert byte pointer to float index
        this.module.HEAPF32.set(params.pointCloudData, inputFloatIndex);
        
        Log.Info('VoxelDownsamplingWASM', 'Input data copied to WASM memory', {
          pointCount,
          inputPtr,
          inputFloatIndex
        });
        
        // Call the direct pointer-based function using ccall
        const outputCount = this.module.ccall(
          'voxelDownsampleDirect',  // Function name (ccall adds underscore automatically)
          'number',  // Return type: int (number of output points)
          ['number', 'number', 'number', 'number', 'number', 'number', 'number'], // Parameter types
          [
            inputPtr,                    // inputPtr (byte pointer, C will cast to float*)
            pointCount,                  // pointCount
            params.voxelSize,            // voxelSize
            params.globalBounds.minX,    // globalMinX
            params.globalBounds.minY,    // globalMinY
            params.globalBounds.minZ,    // globalMinZ
            outputPtr                    // outputPtr (byte pointer, C will cast to float*)
          ]
        );
        
        if (outputCount <= 0 || outputCount > pointCount) {
          throw new Error(`Invalid output count: ${outputCount} (expected 1-${pointCount})`);
        }
        
        Log.Info('VoxelDownsamplingWASM', 'Direct function returned', {
          outputCount,
          outputPtr
        });
        
        // For now, use the existing Embind function to read output
        // We'll optimize output later as requested
        const resultFloatCount = outputCount * 3;
        const outputFloatIndex = outputPtr >> 2;
        
        // Create view of WASM memory for output
        const heapView = this.module.HEAPF32.subarray(
          outputFloatIndex,
          outputFloatIndex + resultFloatCount
        );
        
        // Copy to new array BEFORE freeing WASM memory
        const downsampledPoints = new Float32Array(heapView);
        
        const processingTime = performance.now() - startTime;
        
        Log.Info('VoxelDownsamplingWASM', 'Voxel downsampling completed', {
          originalCount: pointCount,
          downsampledCount: outputCount,
          processingTime
        });
        
        return {
          success: true,
          downsampledPoints,
          originalCount: pointCount,
          downsampledCount: outputCount,
          processingTime,
          voxelCount: outputCount
        };
      } finally {
        // Free allocated memory
        if (inputPtr) this.module._free(inputPtr);
        if (outputPtr) this.module._free(outputPtr);
      }
    } catch (error) {
      Log.Error('VoxelDownsamplingWASM', 'Voxel downsampling failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }


  dispose(): void {
    this.module = null;
    this.removeAllObservers();
  }
}
