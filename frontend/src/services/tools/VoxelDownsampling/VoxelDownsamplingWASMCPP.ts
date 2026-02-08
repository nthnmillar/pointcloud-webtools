import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';
import type {
  VoxelDownsampleParams,
  VoxelDownsampleResult,
} from '../ToolsService';

interface ToolsWasmModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPF32: Float32Array;
  HEAPU8?: Uint8Array;
  cwrap?(
    name: string,
    returnType: string,
    argTypes: string[]
  ): (...args: number[]) => number;
  ccall?(
    name: string,
    returnType: string,
    argTypes: string[],
    args: number[]
  ): number;
}

export class VoxelDownsamplingWASMCPP extends BaseService {
  private module: ToolsWasmModule | null = null;
  private previousOutputPtr: number | null = null;
  private previousOutputColorPtr: number | null = null;
  private previousOutputIntensityPtr: number | null = null;
  private previousOutputClassificationPtr: number | null = null;
  private voxelDownsampleDirectFunc: ((...args: number[]) => number) | null =
    null;
  private voxelDownsampleDirectWithColorsFunc: ((...args: number[]) => number) | null =
    null;
  private voxelDownsampleDirectWithAttributesFunc: ((...args: number[]) => number) | null =
    null;

  constructor(_serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    try {
      Log.Info('VoxelDownsamplingWASM', 'Starting WASM initialization...');

      // Load the unified WASM module
      const toolsPath = new URL('/wasm/cpp/tools_cpp.js', self.location.origin);
      Log.Info(
        'VoxelDownsamplingWASM',
        'Fetching WASM JS from:',
        toolsPath.href
      );

      const response = await fetch(toolsPath.href);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch WASM JS: ${response.status} ${response.statusText}`
        );
      }

      const jsCode = await response.text();
      Log.Info(
        'VoxelDownsamplingWASM',
        'WASM JS code loaded, length:',
        jsCode.length
      );

      // Create a function from the WASM code - handle Emscripten format
      Log.Info('VoxelDownsamplingWASM', 'Creating WASM function...');
      const wasmFunction = new Function(jsCode + '; return ToolsModule;')();

      Log.Info(
        'VoxelDownsamplingWASM',
        'Calling WASM function with locateFile...'
      );
      this.module = await wasmFunction({
        locateFile: (path: string) => {
          Log.Info(
            'VoxelDownsamplingWASM',
            'locateFile called with path:',
            path
          );
          if (path.endsWith('.wasm')) {
            const wasmUrl = new URL(
              '/wasm/cpp/tools_cpp.wasm',
              self.location.origin
            ).href;
            Log.Info('VoxelDownsamplingWASM', 'Resolved WASM URL:', wasmUrl);
            return wasmUrl;
          }
          return path;
        },
      });

      Log.Info('VoxelDownsamplingWASM', 'WASM module loaded successfully');

      // Pre-wrap both voxel downsample functions
      if (this.module && this.module.cwrap) {
        this.voxelDownsampleDirectFunc = this.module.cwrap(
          'voxelDownsampleDirect',
          'number',
          ['number', 'number', 'number', 'number', 'number', 'number', 'number']
        );
        this.voxelDownsampleDirectWithColorsFunc = this.module.cwrap(
          'voxelDownsampleDirectWithColors',
          'number',
          [
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
          ]
        );
        this.voxelDownsampleDirectWithAttributesFunc = this.module.cwrap(
          'voxelDownsampleDirectWithAttributes',
          'number',
          [
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
          ]
        );
        Log.Info(
          'VoxelDownsamplingWASM',
          'Functions wrapped with cwrap for better performance'
        );
      }

      this.isInitialized = true;
    } catch (error) {
      Log.Error(
        'VoxelDownsamplingWASM',
        'Failed to initialize WASM module:',
        error
      );
      throw error;
    }
  }

  async voxelDownsample(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    if (!this.isInitialized || !this.module) {
      Log.Error('VoxelDownsamplingWASM', 'WASM module not available');
      return {
        success: false,
        error: 'WASM module not available',
      };
    }

    try {
      const startTime = performance.now();

      // Check if required functions are available
      if (
        !this.module._malloc ||
        !this.module._free ||
        !this.module.ccall ||
        !this.module.HEAPF32
      ) {
        throw new Error(
          'Required WASM functions not available. Missing: ' +
            (!this.module._malloc ? '_malloc ' : '') +
            (!this.module._free ? '_free ' : '') +
            (!this.module.ccall ? 'ccall ' : '') +
            (!this.module.HEAPF32 ? 'HEAPF32' : '')
        );
      }

      const pointCount = params.pointCloudData.length / 3;
      const floatCount = params.pointCloudData.length;

      // Free previous output buffers if they exist
      if (this.previousOutputPtr !== null) {
        this.module._free(this.previousOutputPtr);
        this.previousOutputPtr = null;
      }
      if (this.previousOutputColorPtr !== null) {
        this.module._free(this.previousOutputColorPtr);
        this.previousOutputColorPtr = null;
      }
      if (this.previousOutputIntensityPtr !== null) {
        this.module._free(this.previousOutputIntensityPtr);
        this.previousOutputIntensityPtr = null;
      }
      if (this.previousOutputClassificationPtr !== null) {
        this.module._free(this.previousOutputClassificationPtr);
        this.previousOutputClassificationPtr = null;
      }

      const useColors =
        params.colors != null && params.colors.length === pointCount * 3;
      const useIntensity =
        params.intensities != null && params.intensities.length === pointCount;
      const useClassification =
        params.classifications != null &&
        params.classifications.length === pointCount;
      const useAttributes =
        (useColors || useIntensity || useClassification) &&
        this.voxelDownsampleDirectWithAttributesFunc != null;

      const inputPtr = this.module._malloc(floatCount * 4);
      const outputPtr = this.module._malloc(floatCount * 4);
      let inputColorPtr = 0;
      let outputColorPtr = 0;
      let inputIntensityPtr = 0;
      let outputIntensityPtr = 0;
      let inputClassPtr = 0;
      let outputClassPtr = 0;

      if (useAttributes) {
        if (useColors && params.colors) {
          inputColorPtr = this.module._malloc(pointCount * 3 * 4);
          outputColorPtr = this.module._malloc(floatCount * 4);
        }
        if (useIntensity && params.intensities) {
          inputIntensityPtr = this.module._malloc(pointCount * 4);
          outputIntensityPtr = this.module._malloc(floatCount * 4);
        }
        if (useClassification && params.classifications && this.module.HEAPU8) {
          inputClassPtr = this.module._malloc(pointCount);
          outputClassPtr = this.module._malloc(pointCount);
        }
      } else if (useColors && params.colors && this.voxelDownsampleDirectWithColorsFunc) {
        inputColorPtr = this.module._malloc(pointCount * 3 * 4);
        outputColorPtr = this.module._malloc(floatCount * 4);
      }

      if (!inputPtr || !outputPtr) {
        if (inputColorPtr) this.module._free(inputColorPtr);
        if (outputColorPtr) this.module._free(outputColorPtr);
        if (inputIntensityPtr) this.module._free(inputIntensityPtr);
        if (outputIntensityPtr) this.module._free(outputIntensityPtr);
        if (inputClassPtr) this.module._free(inputClassPtr);
        if (outputClassPtr) this.module._free(outputClassPtr);
        throw new Error(
          `Failed to allocate WASM memory: inputPtr=${inputPtr}, outputPtr=${outputPtr}`
        );
      }

      const isInputInWasmMemory =
        params.pointCloudData.buffer === this.module.HEAPF32.buffer;
      let inputPtrToUse = inputPtr;

      try {
        if (isInputInWasmMemory) {
          inputPtrToUse = params.pointCloudData.byteOffset;
          this.module._free(inputPtr);
        } else {
          this.module.HEAPF32.set(params.pointCloudData, inputPtr >> 2);
        }

        if (useColors && params.colors && inputColorPtr) {
          this.module.HEAPF32.set(params.colors, inputColorPtr >> 2);
        }
        if (useIntensity && params.intensities && inputIntensityPtr) {
          this.module.HEAPF32.set(params.intensities, inputIntensityPtr >> 2);
        }
        if (
          useClassification &&
          params.classifications &&
          inputClassPtr &&
          this.module.HEAPU8
        ) {
          this.module.HEAPU8.set(params.classifications, inputClassPtr);
        }

        let outputCount: number;
        if (useAttributes && this.voxelDownsampleDirectWithAttributesFunc) {
          outputCount = this.voxelDownsampleDirectWithAttributesFunc(
            inputPtrToUse,
            useColors ? inputColorPtr : 0,
            useIntensity ? inputIntensityPtr : 0,
            useClassification ? inputClassPtr : 0,
            pointCount,
            params.voxelSize,
            params.globalBounds.minX,
            params.globalBounds.minY,
            params.globalBounds.minZ,
            outputPtr,
            useColors ? outputColorPtr : 0,
            useIntensity ? outputIntensityPtr : 0,
            useClassification ? outputClassPtr : 0
          );
        } else if (
          useColors &&
          inputColorPtr &&
          outputColorPtr &&
          this.voxelDownsampleDirectWithColorsFunc
        ) {
          outputCount = this.voxelDownsampleDirectWithColorsFunc(
            inputPtrToUse,
            inputColorPtr,
            pointCount,
            params.voxelSize,
            params.globalBounds.minX,
            params.globalBounds.minY,
            params.globalBounds.minZ,
            outputPtr,
            outputColorPtr
          );
        } else {
          outputCount = this.voxelDownsampleDirectFunc
            ? this.voxelDownsampleDirectFunc(
                inputPtrToUse,
                pointCount,
                params.voxelSize,
                params.globalBounds.minX,
                params.globalBounds.minY,
                params.globalBounds.minZ,
                outputPtr
              )
            : this.module.ccall!(
                'voxelDownsampleDirect',
                'number',
                [
                  'number',
                  'number',
                  'number',
                  'number',
                  'number',
                  'number',
                  'number',
                ],
                [
                  inputPtrToUse,
                  pointCount,
                  params.voxelSize,
                  params.globalBounds.minX,
                  params.globalBounds.minY,
                  params.globalBounds.minZ,
                  outputPtr,
                ]
              );
        }

        if (outputCount <= 0 || outputCount > pointCount) {
          throw new Error(
            `Invalid output count: ${outputCount} (expected 1-${pointCount})`
          );
        }

        const resultFloatCount = outputCount * 3;
        const outputFloatIndex = outputPtr >> 2;
        const downsampledPoints = this.module.HEAPF32.subarray(
          outputFloatIndex,
          outputFloatIndex + resultFloatCount
        );

        this.previousOutputPtr = outputPtr;

        let downsampledColors: Float32Array | undefined;
        let downsampledIntensities: Float32Array | undefined;
        let downsampledClassifications: Uint8Array | undefined;

        if (useColors && outputColorPtr) {
          this.previousOutputColorPtr = outputColorPtr;
          downsampledColors = this.module.HEAPF32.subarray(
            outputColorPtr >> 2,
            (outputColorPtr >> 2) + resultFloatCount
          ).slice(0);
        }
        if (useIntensity && outputIntensityPtr) {
          this.previousOutputIntensityPtr = outputIntensityPtr;
          downsampledIntensities = this.module.HEAPF32.subarray(
            outputIntensityPtr >> 2,
            (outputIntensityPtr >> 2) + outputCount
          ).slice(0);
        }
        if (useClassification && outputClassPtr && this.module.HEAPU8) {
          this.previousOutputClassificationPtr = outputClassPtr;
          downsampledClassifications = this.module.HEAPU8.subarray(
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
          processingTime,
          voxelCount: outputCount,
        };
      } finally {
        if (!isInputInWasmMemory && inputPtr) this.module._free(inputPtr);
        if (inputColorPtr) this.module._free(inputColorPtr);
        if (inputIntensityPtr) this.module._free(inputIntensityPtr);
        if (inputClassPtr) this.module._free(inputClassPtr);
      }
    } catch (error) {
      Log.Error('VoxelDownsamplingWASM', 'Voxel downsampling failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  dispose(): void {
    if (this.module && this.module._free) {
      if (this.previousOutputPtr !== null) {
        this.module._free(this.previousOutputPtr);
        this.previousOutputPtr = null;
      }
      if (this.previousOutputColorPtr !== null) {
        this.module._free(this.previousOutputColorPtr);
        this.previousOutputColorPtr = null;
      }
      if (this.previousOutputIntensityPtr !== null) {
        this.module._free(this.previousOutputIntensityPtr);
        this.previousOutputIntensityPtr = null;
      }
      if (this.previousOutputClassificationPtr !== null) {
        this.module._free(this.previousOutputClassificationPtr);
        this.previousOutputClassificationPtr = null;
      }
    }
    this.module = null;
    this.removeAllObservers();
  }
}
