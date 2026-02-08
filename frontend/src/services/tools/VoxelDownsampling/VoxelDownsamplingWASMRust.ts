import { BaseService } from '../../BaseService';
import { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';
import type {
  VoxelDownsampleParams,
  VoxelDownsampleResult,
} from '../ToolsService';

// Import the Rust WASM module
import init, {
  PointCloudToolsRust,
} from '../../../../public/wasm/rust/tools_rust.js';

interface RustWasmInstance {
  memory: WebAssembly.Memory;
  __wbindgen_export_0: (size: number, align: number) => number; // malloc
  __wbindgen_export_1: (ptr: number, size: number, align: number) => void; // free
}

interface PointCloudToolsRustStatic {
  voxel_downsample_direct_static: (
    inputPtr: number,
    pointCount: number,
    voxelSize: number,
    minX: number,
    minY: number,
    minZ: number,
    outputPtr: number
  ) => number;
  voxel_downsample_direct_with_attributes_static?: (
    inputPtr: number,
    inputColorPtr: number,
    inputIntensityPtr: number,
    inputClassPtr: number,
    pointCount: number,
    voxelSize: number,
    minX: number,
    minY: number,
    minZ: number,
    outputPtr: number,
    outputColorPtr: number,
    outputIntensityPtr: number,
    outputClassPtr: number
  ) => number;
}

export class VoxelDownsamplingWASMRust extends BaseService {
  private wasmModule: PointCloudToolsRust | null = null;
  private wasmInstance: RustWasmInstance | null = null;
  private memory: WebAssembly.Memory | null = null;
  private heapF32: Float32Array | null = null;
  private heapU8: Uint8Array | null = null;
  private voxelDownsampleDirectStaticFunc:
    | ((...args: number[]) => number)
    | null = null;
  private voxelDownsampleWithAttributesStaticFunc:
    | ((...args: number[]) => number)
    | null = null;
  private previousOutputPtr: number | null = null;
  private previousOutputSize: number = 0;
  private previousOutputColorPtr: number | null = null;
  private previousOutputColorSize: number = 0;
  private previousOutputIntensityPtr: number | null = null;
  private previousOutputIntensitySize: number = 0;
  private previousOutputClassificationPtr: number | null = null;
  private previousOutputClassificationSize: number = 0;

  constructor(_serviceManager: ServiceManager) {
    super();
    Log.Info(
      'VoxelDownsamplingWASMRust',
      'Rust WASM voxel downsampling service created'
    );
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
        // OPTIMIZATION: Cache Float32Array view to avoid allocation on every call
        this.heapF32 = new Float32Array(wasm.memory.buffer);
      } else {
        throw new Error('WASM memory not available');
      }

      // Verify malloc/free functions are available
      // wasm-bindgen exports them as __wbindgen_export_0 (malloc) and __wbindgen_export_1 (free)
      if (!wasm.__wbindgen_export_0 || !wasm.__wbindgen_export_1) {
        throw new Error('WASM malloc/free functions not available');
      }

      // Cache static function - required, no fallback
      const PointCloudToolsRustStatic =
        PointCloudToolsRust as unknown as PointCloudToolsRustStatic;
      if (
        typeof PointCloudToolsRustStatic.voxel_downsample_direct_static !==
        'function'
      ) {
        throw new Error(
          'voxel_downsample_direct_static function not available in Rust WASM module'
        );
      }
      this.voxelDownsampleDirectStaticFunc =
        PointCloudToolsRustStatic.voxel_downsample_direct_static;
      if (typeof PointCloudToolsRustStatic.voxel_downsample_direct_with_attributes_static === 'function') {
        this.voxelDownsampleWithAttributesStaticFunc =
          PointCloudToolsRustStatic.voxel_downsample_direct_with_attributes_static;
      }

      // Create the Rust tools instance (still needed for other methods)
      this.wasmModule = new PointCloudToolsRust();

      this.isInitialized = true;
      Log.Info(
        'VoxelDownsamplingWASMRust',
        'Rust WASM module initialized successfully'
      );
    } catch (error) {
      Log.Error(
        'VoxelDownsamplingWASMRust',
        'Failed to initialize Rust WASM module',
        error
      );
      throw error;
    }
  }

  /** Main-thread voxel downsampling with full data (positions, colors, intensities, classifications). */
  async voxelDownsample(params: VoxelDownsampleParams): Promise<VoxelDownsampleResult> {
    if (
      !this.isInitialized ||
      !this.wasmInstance ||
      !this.memory
    ) {
      return {
        success: false,
        error: 'Rust WASM module not initialized',
      };
    }

    const startTime = performance.now();
    const { pointCloudData, voxelSize, globalBounds, colors, intensities, classifications } = params;
    const pointCount = pointCloudData.length / 3;
    const floatCount = pointCloudData.length;
    const useColors = colors != null && colors.length === pointCount * 3;
    const useIntensity = intensities != null && intensities.length === pointCount;
    const useClassification =
      classifications != null && classifications.length === pointCount;
    const useAttributes =
      (useColors || useIntensity || useClassification) &&
      this.voxelDownsampleWithAttributesStaticFunc != null;

    const free = this.wasmInstance.__wbindgen_export_1;
    const malloc = this.wasmInstance.__wbindgen_export_0;

    if (this.previousOutputPtr !== null && free) {
      free(this.previousOutputPtr, this.previousOutputSize, 4);
      this.previousOutputPtr = null;
      this.previousOutputSize = 0;
    }
    if (this.previousOutputColorPtr !== null && free) {
      free(this.previousOutputColorPtr, this.previousOutputColorSize, 4);
      this.previousOutputColorPtr = null;
      this.previousOutputColorSize = 0;
    }
    if (this.previousOutputIntensityPtr !== null && free) {
      free(this.previousOutputIntensityPtr, this.previousOutputIntensitySize, 4);
      this.previousOutputIntensityPtr = null;
      this.previousOutputIntensitySize = 0;
    }
    if (this.previousOutputClassificationPtr !== null && free) {
      free(this.previousOutputClassificationPtr, this.previousOutputClassificationSize, 1);
      this.previousOutputClassificationPtr = null;
      this.previousOutputClassificationSize = 0;
    }

    const inputPtr = malloc(floatCount * 4, 4) >>> 0;
    const outputPtr = malloc(floatCount * 4, 4) >>> 0;
    let inputColorPtr = 0;
    let outputColorPtr = 0;
    let inputIntensityPtr = 0;
    let outputIntensityPtr = 0;
    let inputClassPtr = 0;
    let outputClassPtr = 0;

    if (useAttributes) {
      if (useColors && colors) {
        inputColorPtr = malloc(pointCount * 3 * 4, 4) >>> 0;
        outputColorPtr = malloc(floatCount * 4, 4) >>> 0;
      }
      if (useIntensity && intensities) {
        inputIntensityPtr = malloc(pointCount * 4, 4) >>> 0;
        outputIntensityPtr = malloc(floatCount * 4, 4) >>> 0;
      }
      if (useClassification && classifications) {
        inputClassPtr = malloc(pointCount, 1) >>> 0;
        outputClassPtr = malloc(pointCount, 1) >>> 0;
      }
    }

    if (!inputPtr || !outputPtr) {
      if (inputColorPtr) free(inputColorPtr, pointCount * 3 * 4, 4);
      if (outputColorPtr) free(outputColorPtr, floatCount * 4, 4);
      if (inputIntensityPtr) free(inputIntensityPtr, pointCount * 4, 4);
      if (outputIntensityPtr) free(outputIntensityPtr, floatCount * 4, 4);
      if (inputClassPtr) free(inputClassPtr, pointCount, 1);
      if (outputClassPtr) free(outputClassPtr, pointCount, 1);
      return {
        success: false,
        error: `Failed to allocate WASM memory: inputPtr=${inputPtr}, outputPtr=${outputPtr}`,
      };
    }

    const isInputInWasmMemory = pointCloudData.buffer === this.memory.buffer;
    let inputPtrToUse = inputPtr;

    try {
      if (!this.heapF32 || this.heapF32.buffer !== this.memory.buffer) {
        this.heapF32 = new Float32Array(this.memory.buffer);
      }
      if (!this.heapU8 || this.heapU8.buffer !== this.memory.buffer) {
        this.heapU8 = new Uint8Array(this.memory.buffer);
      }

      if (isInputInWasmMemory) {
        inputPtrToUse = pointCloudData.byteOffset;
        free(inputPtr, floatCount * 4, 4);
      } else {
        this.heapF32.set(pointCloudData, inputPtr >> 2);
      }

      if (useColors && colors && inputColorPtr) {
        this.heapF32.set(colors, inputColorPtr >> 2);
      }
      if (useIntensity && intensities && inputIntensityPtr) {
        this.heapF32.set(intensities, inputIntensityPtr >> 2);
      }
      if (useClassification && classifications && inputClassPtr && this.heapU8) {
        this.heapU8.set(classifications, inputClassPtr);
      }

      let outputCount: number;
      if (useAttributes && this.voxelDownsampleWithAttributesStaticFunc) {
        outputCount = this.voxelDownsampleWithAttributesStaticFunc(
          inputPtrToUse,
          useColors ? inputColorPtr : 0,
          useIntensity ? inputIntensityPtr : 0,
          useClassification ? inputClassPtr : 0,
          pointCount,
          voxelSize,
          globalBounds.minX,
          globalBounds.minY,
          globalBounds.minZ,
          outputPtr,
          useColors ? outputColorPtr : 0,
          useIntensity ? outputIntensityPtr : 0,
          useClassification ? outputClassPtr : 0
        );
      } else {
        if (!this.voxelDownsampleDirectStaticFunc) {
          return { success: false, error: 'voxel_downsample_direct_static not available' };
        }
        outputCount = this.voxelDownsampleDirectStaticFunc(
          inputPtrToUse,
          pointCount,
          voxelSize,
          globalBounds.minX,
          globalBounds.minY,
          globalBounds.minZ,
          outputPtr
        );
      }

      if (outputCount <= 0 || outputCount > pointCount) {
        return {
          success: false,
          error: `Invalid output count: ${outputCount}`,
        };
      }

      // Refresh heap views after Rust call (malloc may have grown memory and detached the previous buffer)
      if (!this.heapF32 || this.heapF32.buffer !== this.memory.buffer) {
        this.heapF32 = new Float32Array(this.memory.buffer);
      }
      if (!this.heapU8 || this.heapU8.buffer !== this.memory.buffer) {
        this.heapU8 = new Uint8Array(this.memory.buffer);
      }

      const resultFloatCount = outputCount * 3;
      const outputFloatIndex = outputPtr >> 2;
      const downsampledPoints = new Float32Array(
        this.heapF32.subarray(outputFloatIndex, outputFloatIndex + resultFloatCount)
      );

      this.previousOutputPtr = outputPtr;
      this.previousOutputSize = floatCount * 4;

      let downsampledColors: Float32Array | undefined;
      let downsampledIntensities: Float32Array | undefined;
      let downsampledClassifications: Uint8Array | undefined;

      if (useColors && outputColorPtr) {
        this.previousOutputColorPtr = outputColorPtr;
        this.previousOutputColorSize = floatCount * 4;
        downsampledColors = new Float32Array(
          this.heapF32.subarray(
            outputColorPtr >> 2,
            (outputColorPtr >> 2) + resultFloatCount
          )
        );
      }
      if (useIntensity && outputIntensityPtr) {
        this.previousOutputIntensityPtr = outputIntensityPtr;
        this.previousOutputIntensitySize = floatCount * 4;
        downsampledIntensities = new Float32Array(
          this.heapF32.subarray(
            outputIntensityPtr >> 2,
            (outputIntensityPtr >> 2) + outputCount
          )
        );
      }
      if (useClassification && outputClassPtr && this.heapU8) {
        this.previousOutputClassificationPtr = outputClassPtr;
        this.previousOutputClassificationSize = pointCount;
        downsampledClassifications = this.heapU8.subarray(
          outputClassPtr,
          outputClassPtr + outputCount
        ).slice(0);
      }

      const processingTime = performance.now() - startTime;
      return {
        success: true,
        downsampledPoints,
        downsampledColors,
        downsampledIntensities,
        downsampledClassifications,
        originalCount: pointCount,
        downsampledCount: outputCount,
        voxelCount: outputCount,
        processingTime,
      };
    } finally {
      if (!isInputInWasmMemory) {
        free(inputPtr, floatCount * 4, 4);
      }
      if (inputColorPtr) free(inputColorPtr, pointCount * 3 * 4, 4);
      if (inputIntensityPtr) free(inputIntensityPtr, pointCount * 4, 4);
      if (inputClassPtr) free(inputClassPtr, pointCount, 1);
    }
  }

  dispose(): void {
    const free = this.wasmInstance?.__wbindgen_export_1;
    if (free) {
      if (this.previousOutputPtr !== null) {
        free(this.previousOutputPtr, this.previousOutputSize, 4);
        this.previousOutputPtr = null;
        this.previousOutputSize = 0;
      }
      if (this.previousOutputColorPtr !== null) {
        free(this.previousOutputColorPtr, this.previousOutputColorSize, 4);
        this.previousOutputColorPtr = null;
        this.previousOutputColorSize = 0;
      }
      if (this.previousOutputIntensityPtr !== null) {
        free(this.previousOutputIntensityPtr, this.previousOutputIntensitySize, 4);
        this.previousOutputIntensityPtr = null;
        this.previousOutputIntensitySize = 0;
      }
      if (this.previousOutputClassificationPtr !== null) {
        free(this.previousOutputClassificationPtr, this.previousOutputClassificationSize, 1);
        this.previousOutputClassificationPtr = null;
        this.previousOutputClassificationSize = 0;
      }
    }
    this.wasmModule = null;
    this.wasmInstance = null;
    this.memory = null;
    this.heapF32 = null;
    this.heapU8 = null;
    this.voxelDownsampleDirectStaticFunc = null;
    this.voxelDownsampleWithAttributesStaticFunc = null;
    this.isInitialized = false;
    Log.Info(
      'VoxelDownsamplingWASMRust',
      'Rust WASM voxel downsampling service disposed'
    );
  }
}
