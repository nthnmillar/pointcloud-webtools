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
  // Store output pointer to keep WASM memory alive for zero-copy view
  // Similar to Rust's result_buffer approach
  private previousOutputPtr: number | null = null;
  // Cache wrapped function to avoid ccall overhead on every call
  private voxelDownsampleDirectFunc: ((...args: number[]) => number) | null = null;

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
      
      // OPTIMIZATION: Pre-wrap the function to avoid ccall overhead on every call
      // cwrap caches the function pointer and reduces call overhead
      if (this.module.cwrap) {
        this.voxelDownsampleDirectFunc = this.module.cwrap(
          'voxelDownsampleDirect',
          'number',  // Return type: int
          ['number', 'number', 'number', 'number', 'number', 'number', 'number'] // Parameter types
        );
        Log.Info('VoxelDownsamplingWASM', 'Function wrapped with cwrap for better performance');
      }
      
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
      
      // Free previous output buffer if it exists (keep only one result alive at a time)
      // This is similar to Rust's approach where result_buffer is replaced on each call
      if (this.previousOutputPtr !== null) {
        this.module._free(this.previousOutputPtr);
        this.previousOutputPtr = null;
      }
      
      // Allocate memory in WASM heap for input and output
      // Note: Output buffer must be worst-case (same as input) to avoid buffer overflow
      // The C++ function writes directly to the buffer, so we can't safely estimate
      const inputPtr = this.module._malloc(floatCount * 4); // 4 bytes per float
      const outputPtr = this.module._malloc(floatCount * 4); // Worst-case: same size as input (safe)
      
      if (!inputPtr || !outputPtr) {
        throw new Error(`Failed to allocate WASM memory: inputPtr=${inputPtr}, outputPtr=${outputPtr}`);
      }
      
      // OPTIMIZATION: Check if input is already in WASM memory (zero-copy optimization)
      const isInputInWasmMemory = params.pointCloudData.buffer === this.module.HEAPF32.buffer;
      let inputPtrToUse = inputPtr;
      
      try {
        
        if (isInputInWasmMemory) {
          // Input is already in WASM memory - use it directly (zero-copy!)
          inputPtrToUse = params.pointCloudData.byteOffset;
          // Free the allocated input buffer since we don't need it
          this.module._free(inputPtr);
        } else {
          // OPTIMIZATION: Bulk copy input data using HEAPF32.set()
          // This is much faster than element-by-element copy
          const inputFloatIndex = inputPtr >> 2; // Convert byte pointer to float index
          this.module.HEAPF32.set(params.pointCloudData, inputFloatIndex);
        }
        
        // OPTIMIZATION: Use cached wrapped function (cwrap) instead of ccall for better performance
        // cwrap reduces function call overhead by caching the function pointer
        const outputCount = this.voxelDownsampleDirectFunc
          ? this.voxelDownsampleDirectFunc(
              inputPtrToUse,               // inputPtr (byte pointer, C will cast to float*)
              pointCount,                  // pointCount
              params.voxelSize,            // voxelSize
              params.globalBounds.minX,    // globalMinX
              params.globalBounds.minY,    // globalMinY
              params.globalBounds.minZ,    // globalMinZ
              outputPtr                    // outputPtr (byte pointer, C will cast to float*)
            )
          : this.module.ccall(
              'voxelDownsampleDirect',
              'number',
              ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
              [
                inputPtrToUse,
                pointCount,
                params.voxelSize,
                params.globalBounds.minX,
                params.globalBounds.minY,
                params.globalBounds.minZ,
                outputPtr
              ]
            );
        
        if (outputCount <= 0 || outputCount > pointCount) {
          throw new Error(`Invalid output count: ${outputCount} (expected 1-${pointCount})`);
        }
        
        // ZERO-COPY OUTPUT: Create direct view of WASM memory (similar to Rust's Float32Array::view)
        // Store output pointer to keep WASM memory alive - don't free it immediately
        const resultFloatCount = outputCount * 3;
        const outputFloatIndex = outputPtr >> 2;
        
        // Create zero-copy view of WASM memory - no copying!
        const downsampledPoints = this.module.HEAPF32.subarray(
          outputFloatIndex,
          outputFloatIndex + resultFloatCount
        );
        
        // Store output pointer to keep memory alive (similar to Rust's result_buffer)
        // This allows the zero-copy view to remain valid
        // Previous output pointer was already freed above
        this.previousOutputPtr = outputPtr;
        
        const processingTime = performance.now() - startTime;
        
        return {
          success: true,
          downsampledPoints,
          originalCount: pointCount,
          downsampledCount: outputCount,
          processingTime,
          voxelCount: outputCount
        };
      } finally {
        // Free input memory only if we allocated it (not if it was already in WASM memory)
        if (!isInputInWasmMemory && inputPtr) {
          this.module._free(inputPtr);
        }
        // Note: outputPtr is NOT freed here - it's stored in previousOutputPtr and freed on next call or dispose
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
    // Free stored output buffer if it exists
    if (this.previousOutputPtr !== null && this.module && this.module._free) {
      this.module._free(this.previousOutputPtr);
      this.previousOutputPtr = null;
    }
    this.module = null;
    this.removeAllObservers();
  }
}
