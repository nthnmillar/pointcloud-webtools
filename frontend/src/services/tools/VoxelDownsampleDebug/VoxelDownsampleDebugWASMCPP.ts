import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';

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

interface ToolsWasmModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPF32: Float32Array;
  cwrap?(name: string, returnType: string, argTypes: string[]): (...args: number[]) => number;
  ccall?(name: string, returnType: string, argTypes: string[], args: number[]): number;
}

interface WindowWithToolsModule extends Window {
  ToolsModule?: () => Promise<ToolsWasmModule>;
}

export class VoxelDownsampleDebugWASMCPP extends BaseService {
  private module: ToolsWasmModule | null = null;
  private voxelDebugDirectFunc: ((inputPtr: number, pointCount: number, voxelSize: number, 
                                   minX: number, minY: number, minZ: number, outputPtr: number, maxOutputPoints: number) => number) | null = null;
  private previousOutputPtr: number | null = null;

  constructor(_serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    try {
      // Prefer global module if present (legacy load via script tag)
      if (typeof window !== 'undefined' && (window as WindowWithToolsModule).ToolsModule) {
        this.module = await (window as WindowWithToolsModule).ToolsModule!();
        this.isInitialized = true;
        Log.Info('VoxelDownsampleDebugWASMCPP', 'C++ WASM module loaded from window.ToolsModule');
        return;
      }

      // Fallback: dynamic import like other services (robust to load order)
      Log.Info('VoxelDownsampleDebugWASMCPP', 'window.ToolsModule not found, attempting dynamic import');
      // Note: this file is one directory deeper than WasmFirstService, so we need an extra '../'
      // @ts-expect-error - tools_cpp.js doesn't have type definitions
      const ToolsModuleNs = await import('../../../../public/wasm/cpp/tools_cpp.js') as { default?: (options?: { locateFile?: (path: string) => string }) => Promise<ToolsWasmModule>; ToolsModule?: (options?: { locateFile?: (path: string) => string }) => Promise<ToolsWasmModule> };
      const factory = ToolsModuleNs.default || ToolsModuleNs.ToolsModule;
      if (!factory) {
        throw new Error('WASM module factory not found in tools_cpp.js');
      }
      this.module = await factory();
      
      // Cache the direct function for better performance (like voxel downsampling)
      if (this.module.cwrap) {
        this.voxelDebugDirectFunc = this.module.cwrap(
          'voxelDebugDirect',
          'number',
          ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']
        );
      }
      
      this.isInitialized = true;
      Log.Info('VoxelDownsampleDebugWASMCPP', 'C++ WASM module loaded via dynamic import');
    } catch (error) {
      Log.Error('VoxelDownsampleDebugWASMCPP', 'Failed to load C++ WASM module', error);
      this.isInitialized = false;
      throw new Error('C++ WASM module required for benchmarking - no fallback allowed');
    }
  }

  async generateVoxelCenters(params: VoxelDebugParams): Promise<VoxelDebugResult> {
    // Ensure module is initialized (handles cases where init didn't run yet)
    if (!this.isInitialized || !this.module) {
      try {
        await this.initialize();
      } catch (e) {
        Log.Error('VoxelDownsampleDebugWASMCPP', 'Initialization failed on first use', e);
        return { success: false, error: 'C++ WASM module required for benchmarking - no fallback allowed' };
      }
    }

    Log.Info('VoxelDownsampleDebugWASMCPP', 'Using C++ WASM module for voxel debug generation', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize,
      bounds: params.globalBounds
    });
    
    // Double-check after init attempt
    if (!this.isInitialized || !this.module) {
      return { success: false, error: 'C++ WASM module required for benchmarking - no fallback allowed' };
    }

    try {
      const startTime = performance.now();
      
      // Check if required functions are available
      if (!this.module._malloc || !this.module._free || !this.module.HEAPF32) {
        throw new Error('Required WASM functions not available');
      }
      
      const pointCount = params.pointCloudData.length / 3;
      const floatCount = params.pointCloudData.length;
      
      // Free previous output buffer if it exists
      if (this.previousOutputPtr !== null) {
        this.module._free(this.previousOutputPtr);
        this.previousOutputPtr = null;
      }
      
      // Allocate memory in WASM heap for input and output
      // Output buffer: worst-case same as input (safe estimate)
      const inputPtr = this.module._malloc(floatCount * 4); // 4 bytes per float
      const outputPtr = this.module._malloc(floatCount * 4); // Worst-case: same size as input
      
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
        const outputCount = this.voxelDebugDirectFunc
          ? this.voxelDebugDirectFunc(
              inputPtrToUse,               // inputPtr (byte pointer, C will cast to float*)
              pointCount,                  // pointCount
              params.voxelSize,            // voxelSize
              params.globalBounds.minX,    // minX
              params.globalBounds.minY,    // minY
              params.globalBounds.minZ,    // minZ
              outputPtr,                   // outputPtr (byte pointer, C will cast to float*)
              pointCount                   // maxOutputPoints (safety limit)
            )
          : (this.module.ccall ? this.module.ccall(
              'voxelDebugDirect',
              'number',
              ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
              [
                inputPtrToUse,
                pointCount,
                params.voxelSize,
                params.globalBounds.minX,
                params.globalBounds.minY,
                params.globalBounds.minZ,
                outputPtr,
                pointCount
              ]
            ) : 0);
        
        if (outputCount <= 0 || outputCount > pointCount) {
          throw new Error(`Invalid output count: ${outputCount} (expected 1-${pointCount})`);
        }
        
        // ZERO-COPY OUTPUT: Create direct view of WASM memory
        const resultFloatCount = outputCount * 3;
        const outputFloatIndex = outputPtr >> 2;
        const centersArray = this.module.HEAPF32.subarray(outputFloatIndex, outputFloatIndex + resultFloatCount);
        
        // Copy to new buffer for transfer (WASM memory cannot be transferred)
        const centersArrayCopy = new Float32Array(centersArray);
        
        // Store output pointer to keep WASM memory alive
        this.previousOutputPtr = outputPtr;
        
        const processingTime = performance.now() - startTime;
        
        Log.Info('VoxelDownsampleDebugWASMCPP', 'Voxel centers generated using C++ WASM (direct)', {
          voxelCount: outputCount,
          processingTime: processingTime.toFixed(2) + 'ms'
        });

        return {
          success: true,
          voxelCenters: centersArrayCopy,
          voxelCount: outputCount,
          processingTime
        };
      } catch (error) {
        // Free allocated memory on error
        if (inputPtr && !isInputInWasmMemory) {
          this.module._free(inputPtr);
        }
        if (outputPtr) {
          this.module._free(outputPtr);
        }
        throw error;
      }
    } catch (error) {
      Log.Error('VoxelDownsampleDebugWASMCPP', 'C++ WASM voxel centers generation failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }


  dispose(): void {
    // Free output buffer if it exists
    if (this.previousOutputPtr !== null && this.module && this.module._free) {
      this.module._free(this.previousOutputPtr);
      this.previousOutputPtr = null;
    }
    this.removeAllObservers();
  }
}