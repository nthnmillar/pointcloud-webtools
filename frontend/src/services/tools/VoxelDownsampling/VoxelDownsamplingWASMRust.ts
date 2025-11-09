import { BaseService } from '../../BaseService';
import { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';

// Import the Rust WASM module
import init, { PointCloudToolsRust } from '../../../../public/wasm/rust/tools_rust.js';

export class VoxelDownsamplingWASMRust extends BaseService {
  private wasmModule: PointCloudToolsRust | null = null;
  private wasmInstance: any = null;
  private memory: WebAssembly.Memory | null = null;
  private previousOutputPtr: number | null = null;
  private previousOutputSize: number = 0;

  constructor(_serviceManager: ServiceManager) {
    super();
    Log.Info('VoxelDownsamplingWASMRust', 'Rust WASM voxel downsampling service created');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize the Rust WASM module - init() returns the wasm exports object
      const wasm = await init();
      this.wasmInstance = wasm;
      
      // Get WASM memory for direct access (wasm.memory is the WebAssembly.Memory)
      if (wasm.memory) {
        this.memory = wasm.memory;
      } else {
        throw new Error('WASM memory not available');
      }
      
      // Verify malloc/free functions are available
      // wasm-bindgen exports them as __wbindgen_export_0 (malloc) and __wbindgen_export_1 (free)
      if (!wasm.__wbindgen_export_0 || !wasm.__wbindgen_export_1) {
        throw new Error('WASM malloc/free functions not available');
      }
      
      // Create the Rust tools instance
      this.wasmModule = new PointCloudToolsRust();
      
      this.isInitialized = true;
      Log.Info('VoxelDownsamplingWASMRust', 'Rust WASM module initialized successfully');
    } catch (error) {
      Log.Error('VoxelDownsamplingWASMRust', 'Failed to initialize Rust WASM module', error);
      throw error;
    }
  }

  async performVoxelDownsampling(
    pointCloudData: Float32Array,
    voxelSize: number,
    globalBounds: {
      minX: number;
      minY: number;
      minZ: number;
      maxX: number;
      maxY: number;
      maxZ: number;
    }
  ): Promise<{
    success: boolean;
    downsampledPoints?: Float32Array;
    originalCount?: number;
    downsampledCount?: number;
    voxelCount?: number;
    processingTime?: number;
    error?: string;
  }> {
    if (!this.isInitialized || !this.wasmModule || !this.wasmInstance || !this.memory) {
      throw new Error('Rust WASM module not initialized');
    }

    const startTime = performance.now();

    try {
      const pointCount = pointCloudData.length / 3;
      const floatCount = pointCloudData.length;
      
      // Free previous output buffer if it exists
      // wasm-bindgen exports free as __wbindgen_export_1(ptr, size, align)
      if (this.previousOutputPtr !== null && this.wasmInstance.__wbindgen_export_1) {
        this.wasmInstance.__wbindgen_export_1(this.previousOutputPtr, this.previousOutputSize, 4);
        this.previousOutputPtr = null;
        this.previousOutputSize = 0;
      }
      
      // Allocate memory in WASM heap (like C++ does)
      // wasm-bindgen exports malloc as __wbindgen_export_0(size, align)
      const inputPtr = this.wasmInstance.__wbindgen_export_0(floatCount * 4, 4) >>> 0;
      const outputPtr = this.wasmInstance.__wbindgen_export_0(floatCount * 4, 4) >>> 0;
      
      if (!inputPtr || !outputPtr) {
        throw new Error(`Failed to allocate WASM memory: inputPtr=${inputPtr}, outputPtr=${outputPtr}`);
      }
      
      // Check if input is already in WASM memory (zero-copy optimization)
      const isInputInWasmMemory = pointCloudData.buffer === this.memory.buffer;
      let inputPtrToUse = inputPtr;
      
      try {
        
        if (isInputInWasmMemory) {
          // Input is already in WASM memory - use it directly (zero-copy!)
          inputPtrToUse = pointCloudData.byteOffset;
          // Free the allocated input buffer since we don't need it
          this.wasmInstance.__wbindgen_export_1(inputPtr, floatCount * 4, 4);
        } else {
          // Input is in JS memory - copy to WASM memory (same as C++)
          const heapF32 = new Float32Array(this.memory.buffer);
          const inputFloatIndex = inputPtr >> 2; // Bit shift is faster than division (same as C++)
          heapF32.set(pointCloudData, inputFloatIndex);
        }
        
        // Call direct function (zero-copy during processing, like C++)
        const outputCount = typeof (PointCloudToolsRust as any).voxel_downsample_direct_static === 'function'
          ? (PointCloudToolsRust as any).voxel_downsample_direct_static(
              inputPtrToUse, pointCount, voxelSize,
              globalBounds.minX, globalBounds.minY, globalBounds.minZ, outputPtr
            )
          : (this.wasmModule as any).voxel_downsample_direct(
              inputPtrToUse, pointCount, voxelSize,
              globalBounds.minX, globalBounds.minY, globalBounds.minZ, outputPtr
            );
        
        if (outputCount <= 0 || outputCount > pointCount) {
          throw new Error(`Invalid output count: ${outputCount}`);
        }
        
        // Read output directly from WASM memory (zero-copy view, like C++)
        // Use subarray() to create a view, NOT new Float32Array() which copies
        const freshHeapF32 = new Float32Array(this.memory.buffer);
        const resultFloatCount = outputCount * 3;
        const outputFloatIndex = outputPtr >> 2; // Bit shift is faster than division (same as C++)
        const downsampledPoints = freshHeapF32.subarray(outputFloatIndex, outputFloatIndex + resultFloatCount);
        
        // Store output pointer and size to keep memory alive
        this.previousOutputPtr = outputPtr;
        this.previousOutputSize = floatCount * 4;
        
        const processingTime = performance.now() - startTime;
        
        return {
          success: true,
          downsampledPoints,
          originalCount: pointCount,
          downsampledCount: outputCount,
          voxelCount: outputCount,
          processingTime
        };
      } finally {
        // Free input memory only if we allocated it (not if it was already in WASM memory)
        // wasm-bindgen exports free as __wbindgen_export_1(ptr, size, align)
        if (!isInputInWasmMemory) {
          this.wasmInstance.__wbindgen_export_1(inputPtr, floatCount * 4, 4);
        }
      }
    } catch (error) {
      const processingTime = performance.now() - startTime;
      return {
        success: false,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  dispose(): void {
    // Free stored output buffer if it exists
    // wasm-bindgen exports free as __wbindgen_export_1(ptr, size, align)
    if (this.previousOutputPtr !== null && this.wasmInstance?.__wbindgen_export_1) {
      this.wasmInstance.__wbindgen_export_1(this.previousOutputPtr, this.previousOutputSize, 4);
      this.previousOutputPtr = null;
      this.previousOutputSize = 0;
    }
    this.wasmModule = null;
    this.wasmInstance = null;
    this.memory = null;
    this.isInitialized = false;
    Log.Info('VoxelDownsamplingWASMRust', 'Rust WASM voxel downsampling service disposed');
  }
}

