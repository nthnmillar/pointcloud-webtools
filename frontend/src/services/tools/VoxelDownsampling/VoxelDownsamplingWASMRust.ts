import { BaseService } from '../../BaseService';
import { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';

// Import the Rust WASM module
import init, { PointCloudToolsRust } from '../../../../public/wasm/rust/tools_rust.js';

export class VoxelDownsamplingWASMRust extends BaseService {
  private wasmModule: PointCloudToolsRust | null = null;
  // Store output pointer to keep WASM memory alive for zero-copy view
  private previousOutputPtr: number | null = null;
  // Cache memory buffer for direct access
  private memory: WebAssembly.Memory | null = null;
  // Store the wasm instance to access malloc/free and memory
  private wasmInstance: any = null;

  constructor(_serviceManager: ServiceManager) {
    super();
    Log.Info('VoxelDownsamplingWASMRust', 'Rust WASM voxel downsampling service created');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('🔧 Rust WASM: Starting initialization...');
      Log.Info('VoxelDownsamplingWASMRust', 'Starting Rust WASM initialization...');
      
      // Initialize the Rust WASM module
      // init() returns the wasm instance (exports) - this is what we need!
      console.log('🔧 Rust WASM: Calling init()...');
      const wasmInstance = await init();
      console.log('🔧 Rust WASM: init() completed');
      
      if (!wasmInstance) {
        throw new Error('init() did not return wasm instance');
      }
      
      // Store the wasm instance - it contains __wbindgen_malloc, __wbindgen_free, and memory
      this.wasmInstance = wasmInstance;
      
      // Get memory from wasm instance (same as getFloat32ArrayMemory0 uses)
      if (this.wasmInstance.memory) {
        this.memory = this.wasmInstance.memory;
        Log.Info('VoxelDownsamplingWASMRust', 'WASM memory accessed via init() return value');
      } else {
        throw new Error('WASM memory not available');
      }
      
      // Verify malloc/free functions are available
      if (!this.wasmInstance.__wbindgen_malloc || !this.wasmInstance.__wbindgen_free) {
        throw new Error('WASM malloc/free functions not available');
      }
      
      // Create the Rust tools instance
      this.wasmModule = new PointCloudToolsRust();
      
      this.isInitialized = true;
      console.log('🔧 Rust WASM: Initialization completed successfully');
      Log.Info('VoxelDownsamplingWASMRust', 'Rust WASM module loaded successfully for real benchmarking');
    } catch (error) {
      console.error('🔧 Rust WASM: Initialization failed:', error);
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
    voxelCount?: number;
    processingTime?: number;
    error?: string;
  }> {
    console.log('🔧 Rust WASM: performVoxelDownsampling called', {
      isInitialized: this.isInitialized,
      wasmModule: !!this.wasmModule,
      pointCount: pointCloudData.length / 3,
      voxelSize,
      bounds: globalBounds
    });
    
    if (!this.isInitialized || !this.wasmModule) {
      console.error('🔧 Rust WASM: Module not initialized!', {
        isInitialized: this.isInitialized,
        wasmModule: !!this.wasmModule
      });
      throw new Error('Rust WASM module not initialized');
    }

    const startTime = performance.now();

    try {
      Log.Info('VoxelDownsamplingWASMRust', 'Starting Rust WASM voxel downsampling', {
        pointCount: pointCloudData.length / 3,
        voxelSize,
        bounds: globalBounds
      });

      // OPTIMIZATION: Use direct memory access similar to C++
      // NO FALLBACKS - fail fast to see errors
      if (!this.wasmModule) {
        throw new Error('WASM module not initialized');
      }
      
      const pointCount = pointCloudData.length / 3;
      const floatCount = pointCloudData.length;
      
      // Use wasm-bindgen's malloc to allocate memory in WASM heap (same pattern as passArrayF32ToWasm0)
      // This ensures the memory is accessible from Rust
      if (!this.wasmInstance || !this.wasmInstance.__wbindgen_malloc || !this.wasmInstance.__wbindgen_free) {
        throw new Error('WASM malloc/free functions not available');
      }
      
      if (!this.memory) {
        throw new Error('WASM memory not available');
      }
      
      // Free previous output buffer if it exists
      if (this.previousOutputPtr !== null) {
        this.wasmInstance.__wbindgen_free(this.previousOutputPtr);
        this.previousOutputPtr = null;
      }
      
      // Allocate memory using wasm-bindgen's malloc (same as passArrayF32ToWasm0 does)
      // This allocates memory in WASM heap that Rust can access
      const inputPtr = this.wasmInstance.__wbindgen_malloc(floatCount * 4, 4) >>> 0; // 4-byte aligned
      const outputPtr = this.wasmInstance.__wbindgen_malloc(floatCount * 4, 4) >>> 0; // Worst-case size
      
      if (!inputPtr || !outputPtr) {
        throw new Error(`Failed to allocate WASM memory: inputPtr=${inputPtr}, outputPtr=${outputPtr}`);
      }
      
      try {
        // CRITICAL: Always get a fresh reference to memory.buffer right before use
        // memory.buffer can become detached if memory.grow() is called or if the reference is stale
        if (!this.memory) {
          throw new Error('WASM memory not available');
        }
        
        // Get fresh buffer reference - don't cache it!
        const memoryBuffer = this.memory.buffer;
        if (!memoryBuffer || memoryBuffer.byteLength === 0) {
          throw new Error('WASM memory buffer is invalid or detached');
        }
        
        // Get Float32Array view of WASM memory (same as getFloat32ArrayMemory0)
        const heapF32 = new Float32Array(memoryBuffer);
        
        // Copy input data to WASM memory (zero-copy input - bulk copy)
        const inputFloatIndex = inputPtr / 4;
        heapF32.set(pointCloudData, inputFloatIndex);
        
        Log.Info('VoxelDownsamplingWASMRust', 'Input data copied to WASM memory via malloc', {
          pointCount,
          inputPtr,
          inputFloatIndex
        });
        
        // Call direct function with pointers allocated via malloc
        const hasStaticFunc = typeof (PointCloudToolsRust as any).voxel_downsample_direct_static === 'function';
        const outputCount = hasStaticFunc
          ? (PointCloudToolsRust as any).voxel_downsample_direct_static(
              inputPtr,
              pointCount,
              voxelSize,
              globalBounds.minX,
              globalBounds.minY,
              globalBounds.minZ,
              outputPtr
            )
          : (this.wasmModule as any).voxel_downsample_direct(
              inputPtr,
              pointCount,
              voxelSize,
              globalBounds.minX,
              globalBounds.minY,
              globalBounds.minZ,
              outputPtr
            );
        
        if (outputCount <= 0 || outputCount > pointCount) {
          throw new Error(`Invalid output count: ${outputCount} (expected 1-${pointCount})`);
        }
        
        // CRITICAL: Get fresh buffer reference again before reading output
        // The Rust function might have caused memory to grow, invalidating the previous buffer reference
        const freshMemoryBuffer = this.memory.buffer;
        if (!freshMemoryBuffer || freshMemoryBuffer.byteLength === 0) {
          throw new Error('WASM memory buffer became invalid after processing');
        }
        
        // ZERO-COPY OUTPUT: Read directly from WASM memory (same as getArrayF32FromWasm0)
        const freshHeapF32 = new Float32Array(freshMemoryBuffer);
        const resultFloatCount = outputCount * 3;
        const outputFloatIndex = outputPtr / 4;
        const downsampledPoints = freshHeapF32.subarray(outputFloatIndex, outputFloatIndex + resultFloatCount);
        
        // Copy to persist (subarray is a view)
        const persistedPoints = new Float32Array(downsampledPoints);
        
        // Store output pointer to keep memory alive for zero-copy view
        this.previousOutputPtr = outputPtr;
        
        const processingTime = performance.now() - startTime;
        
        Log.Info('VoxelDownsamplingWASMRust', 'Rust WASM voxel downsampling completed with zero-copy', {
          originalCount: pointCount,
          downsampledCount: outputCount,
          processingTime: processingTime.toFixed(2) + 'ms',
          method: 'direct memory access via malloc'
        });
        
        return {
          success: true,
          downsampledPoints: persistedPoints,
          originalCount: pointCount,
          downsampledCount: outputCount,
          voxelCount: outputCount,
          processingTime
        };
      } finally {
        // Free input memory immediately (output memory kept alive for zero-copy view)
        if (inputPtr) this.wasmInstance.__wbindgen_free(inputPtr);
        // Note: outputPtr is NOT freed here - it's stored in previousOutputPtr and freed on next call
      }
    } catch (error) {
      const processingTime = performance.now() - startTime;
      Log.Error('VoxelDownsamplingWASMRust', 'Rust WASM voxel downsampling failed', error);
      
      return {
        success: false,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  dispose(): void {
    this.wasmModule = null;
    this.isInitialized = false;
    Log.Info('VoxelDownsamplingWASMRust', 'Rust WASM voxel downsampling service disposed');
  }
}

