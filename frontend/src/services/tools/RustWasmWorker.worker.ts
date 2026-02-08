// Web Worker for Rust WASM processing tools - Classic Worker
import { Log } from '../../utils/Log';

interface PointCloudToolsRust {
  point_cloud_smooth(
    points: Float64Array,
    smoothingRadius: number,
    iterations: number
  ): Float64Array;
  generate_voxel_centers(
    points: Float32Array,
    voxelSize: number,
    minX: number,
    minY: number,
    minZ: number
  ): Float64Array;
}

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
  voxel_downsample_direct_with_attributes_static: (
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

interface RustWasmModule {
  default: (wasmPath: string) => Promise<RustWasmInstance>;
  PointCloudToolsRust: (new () => PointCloudToolsRust) &
    PointCloudToolsRustStatic;
}

let wasmModule: PointCloudToolsRust | null = null;
let wasmInstance: RustWasmInstance | null = null;
let memory: WebAssembly.Memory | null = null;
let heapF32: Float32Array | null = null;
let heapU8: Uint8Array | null = null;
let voxelDownsampleDirectStaticFunc: ((...args: number[]) => number) | null =
  null;
let voxelDownsampleWithAttributesStaticFunc: ((...args: number[]) => number) | null =
  null;
let previousOutputPtr: number | null = null;
let previousOutputSize: number = 0;
let previousOutputColorPtr: number | null = null;
let previousOutputColorSize: number = 0;
let previousOutputIntensityPtr: number | null = null;
let previousOutputIntensitySize: number = 0;
let previousOutputClassificationPtr: number | null = null;
let previousOutputClassificationSize: number = 0;

// Initialize Rust WASM module
async function initialize() {
  try {
    Log.Info('RustWasmWorker', 'Starting Rust WASM initialization...');

    // Load WASM JS code using fetch
    const response = await fetch('/wasm/rust/tools_rust.js');
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Rust WASM JS: ${response.status} ${response.statusText}`
      );
    }

    const jsCode = await response.text();
    Log.Info('RustWasmWorker', 'Rust WASM JS code loaded', {
      length: jsCode.length,
    });

    // Create a data URL for the module and import it
    const blob = new Blob([jsCode], { type: 'application/javascript' });
    const moduleUrl = URL.createObjectURL(blob);

    Log.Info('RustWasmWorker', 'Created module URL:', moduleUrl);

    const module = (await import(
      /* @vite-ignore */ moduleUrl
    )) as unknown as RustWasmModule;
    Log.Info('RustWasmWorker', 'Module imported successfully');
    Log.Info('RustWasmWorker', 'Module exports:', Object.keys(module));

    // Clean up the URL
    URL.revokeObjectURL(moduleUrl);

    // Get the init function and PointCloudToolsRust class
    const init = module.default;
    const PointCloudToolsRust = module.PointCloudToolsRust;

    Log.Info('RustWasmWorker', 'Init function:', typeof init);

    // Initialize the WASM module - init() returns the wasm exports object
    wasmInstance = await init('/wasm/rust/tools_rust.wasm');

    // Get WASM memory for direct access (wasm.memory is the WebAssembly.Memory)
    const wasmMemory = wasmInstance.memory;
    if (!wasmMemory) {
      throw new Error('WASM memory not available');
    }
    memory = wasmMemory;
    // OPTIMIZATION: Cache Float32Array view to avoid allocation on every call
    // memory is guaranteed to be non-null after the check above
    heapF32 = new Float32Array(memory!.buffer);

    // Verify malloc/free functions are available
    // wasm-bindgen exports them as __wbindgen_export_0 (malloc) and __wbindgen_export_1 (free)
    if (
      !wasmInstance.__wbindgen_export_0 ||
      !wasmInstance.__wbindgen_export_1
    ) {
      throw new Error('WASM malloc/free functions not available');
    }

    // Cache static function - required, no fallback
    if (
      typeof PointCloudToolsRust.voxel_downsample_direct_static !== 'function'
    ) {
      throw new Error(
        'voxel_downsample_direct_static function not available in Rust WASM module'
      );
    }
    voxelDownsampleDirectStaticFunc =
      PointCloudToolsRust.voxel_downsample_direct_static;
    if (typeof PointCloudToolsRust.voxel_downsample_direct_with_attributes_static === 'function') {
      voxelDownsampleWithAttributesStaticFunc =
        PointCloudToolsRust.voxel_downsample_direct_with_attributes_static;
    }

    Log.Info(
      'RustWasmWorker',
      'WASM module initialized, creating PointCloudToolsRust instance...'
    );

    // Create the Rust tools instance (still needed for other methods)
    wasmModule = new PointCloudToolsRust();

    Log.Info(
      'RustWasmWorker',
      'PointCloudToolsRust instance created:',
      wasmModule
    );

    Log.Info('RustWasmWorker', 'Rust WASM module initialized successfully');
  } catch (error) {
    Log.Error('RustWasmWorker', 'Failed to initialize Rust WASM module', error);
    throw error;
  }
}

interface VoxelDownsampleData {
  pointCloudData: Float32Array;
  voxelSize: number;
  globalBounds: {
    minX: number;
    minY: number;
    minZ: number;
  };
  colors?: Float32Array;
  intensities?: Float32Array;
  classifications?: Uint8Array;
}

// Handle voxel downsampling (supports full attributes: colors, intensities, classifications)
async function handleVoxelDownsampling(
  data: VoxelDownsampleData,
  messageId: number
): Promise<void> {
  if (!wasmModule || !wasmInstance || !memory) {
    throw new Error('Rust WASM module not initialized');
  }

  const startTime = performance.now();
  const { pointCloudData, voxelSize, globalBounds, colors, intensities, classifications } = data;
  const pointCount = pointCloudData.length / 3;
  const floatCount = pointCloudData.length;
  const useColors = colors != null && colors.length === pointCount * 3;
  const useIntensity = intensities != null && intensities.length === pointCount;
  const useClassification =
    classifications != null && classifications.length === pointCount;
  const useAttributes =
    (useColors || useIntensity || useClassification) &&
    voxelDownsampleWithAttributesStaticFunc != null;

  const free = wasmInstance.__wbindgen_export_1;
  const malloc = wasmInstance.__wbindgen_export_0;

  if (previousOutputPtr !== null && free) {
    free(previousOutputPtr, previousOutputSize, 4);
    previousOutputPtr = null;
    previousOutputSize = 0;
  }
  if (previousOutputColorPtr !== null && free) {
    free(previousOutputColorPtr, previousOutputColorSize, 4);
    previousOutputColorPtr = null;
    previousOutputColorSize = 0;
  }
  if (previousOutputIntensityPtr !== null && free) {
    free(previousOutputIntensityPtr, previousOutputIntensitySize, 4);
    previousOutputIntensityPtr = null;
    previousOutputIntensitySize = 0;
  }
  if (previousOutputClassificationPtr !== null && free) {
    free(previousOutputClassificationPtr, previousOutputClassificationSize, 1);
    previousOutputClassificationPtr = null;
    previousOutputClassificationSize = 0;
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
    throw new Error(`Failed to allocate WASM memory: inputPtr=${inputPtr}, outputPtr=${outputPtr}`);
  }

  const isInputInWasmMemory = pointCloudData.buffer === memory.buffer;
  let inputPtrToUse = inputPtr;

  try {
    if (!heapF32 || heapF32.buffer !== memory.buffer) {
      heapF32 = new Float32Array(memory.buffer);
    }
    if (!heapU8 || heapU8.buffer !== memory.buffer) {
      heapU8 = new Uint8Array(memory.buffer);
    }

    if (isInputInWasmMemory) {
      inputPtrToUse = pointCloudData.byteOffset;
      free(inputPtr, floatCount * 4, 4);
    } else {
      heapF32.set(pointCloudData, inputPtr >> 2);
    }

    if (useColors && colors && inputColorPtr) {
      heapF32.set(colors, inputColorPtr >> 2);
    }
    if (useIntensity && intensities && inputIntensityPtr) {
      heapF32.set(intensities, inputIntensityPtr >> 2);
    }
    if (useClassification && classifications && inputClassPtr && heapU8) {
      heapU8.set(classifications, inputClassPtr);
    }

    let outputCount: number;
    if (useAttributes && voxelDownsampleWithAttributesStaticFunc) {
      outputCount = voxelDownsampleWithAttributesStaticFunc(
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
      if (!voxelDownsampleDirectStaticFunc) {
        throw new Error('voxel_downsample_direct_static function not available');
      }
      outputCount = voxelDownsampleDirectStaticFunc(
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
      throw new Error(`Invalid output count: ${outputCount}`);
    }

    // Refresh heap views in case WASM memory grew (which detaches the old buffer)
    heapF32 = new Float32Array(memory!.buffer);
    heapU8 = new Uint8Array(memory!.buffer);

    const resultFloatCount = outputCount * 3;
    const outputFloatIndex = outputPtr >> 2;
    const downsampledPoints = new Float32Array(
      heapF32.subarray(outputFloatIndex, outputFloatIndex + resultFloatCount)
    );

    previousOutputPtr = outputPtr;
    previousOutputSize = floatCount * 4;

    let downsampledColors: Float32Array | undefined;
    let downsampledIntensities: Float32Array | undefined;
    let downsampledClassifications: Uint8Array | undefined;

    if (useColors && outputColorPtr) {
      previousOutputColorPtr = outputColorPtr;
      previousOutputColorSize = floatCount * 4;
      downsampledColors = new Float32Array(
        heapF32.subarray(
          outputColorPtr >> 2,
          (outputColorPtr >> 2) + resultFloatCount
        )
      );
    }
    if (useIntensity && outputIntensityPtr) {
      previousOutputIntensityPtr = outputIntensityPtr;
      previousOutputIntensitySize = floatCount * 4;
      downsampledIntensities = new Float32Array(
        heapF32.subarray(
          outputIntensityPtr >> 2,
          (outputIntensityPtr >> 2) + outputCount
        )
      );
    }
    if (useClassification && outputClassPtr && heapU8) {
      previousOutputClassificationPtr = outputClassPtr;
      previousOutputClassificationSize = pointCount;
      downsampledClassifications = heapU8.subarray(
        outputClassPtr,
        outputClassPtr + outputCount
      ).slice(0);
    }

    const processingTime = performance.now() - startTime;

    const transfer: Transferable[] = [downsampledPoints.buffer];
    if (downsampledColors) transfer.push(downsampledColors.buffer);
    if (downsampledIntensities) transfer.push(downsampledIntensities.buffer);
    if (downsampledClassifications) transfer.push(downsampledClassifications.buffer);

    self.postMessage(
      {
        type: 'SUCCESS',
        method: 'WASM_RUST',
        messageId,
        data: {
          downsampledPoints,
          downsampledColors,
          downsampledIntensities,
          downsampledClassifications,
          originalCount: pointCount,
          downsampledCount: outputCount,
          processingTime,
        },
      },
      { transfer }
    );
  } finally {
    if (!isInputInWasmMemory) {
      free(inputPtr, floatCount * 4, 4);
    }
    if (inputColorPtr) free(inputColorPtr, pointCount * 3 * 4, 4);
    if (inputIntensityPtr) free(inputIntensityPtr, pointCount * 4, 4);
    if (inputClassPtr) free(inputClassPtr, pointCount, 1);
  }
}

interface PointCloudSmoothingData {
  pointCloudData: Float32Array;
  smoothingRadius: number;
  iterations: number;
  colors?: Float32Array;
  intensities?: Float32Array;
  classifications?: Uint8Array;
}

// Handle point cloud smoothing
async function handlePointCloudSmoothing(
  data: PointCloudSmoothingData,
  messageId: number
): Promise<void> {
  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  const startTime = performance.now();
  const result = wasmModule.point_cloud_smooth(
    new Float64Array(data.pointCloudData),
    data.smoothingRadius,
    data.iterations
  );
  const processingTime = performance.now() - startTime;
  const smoothedPoints = new Float32Array(result);
  const pointCount = smoothedPoints.length / 3;
  // Pass through attributes (point count and order unchanged)
  const smoothedColors =
    data.colors != null && data.colors.length === pointCount * 3
      ? new Float32Array(data.colors)
      : undefined;
  const smoothedIntensities =
    data.intensities != null && data.intensities.length === pointCount
      ? new Float32Array(data.intensities)
      : undefined;
  const smoothedClassifications =
    data.classifications != null && data.classifications.length === pointCount
      ? new Uint8Array(data.classifications)
      : undefined;

  const response = {
    type: 'SUCCESS',
    method: 'WASM_RUST',
    messageId,
    data: {
      smoothedPoints,
      smoothedColors,
      smoothedIntensities,
      smoothedClassifications,
      originalCount: data.pointCloudData.length / 3,
      smoothedCount: pointCount,
      processingTime,
    },
  };

  const transfer: Transferable[] = [smoothedPoints.buffer];
  if (smoothedColors) transfer.push(smoothedColors.buffer);
  if (smoothedIntensities) transfer.push(smoothedIntensities.buffer);
  if (smoothedClassifications) transfer.push(smoothedClassifications.buffer);
  self.postMessage(response, { transfer });
}

interface VoxelDebugData {
  pointCloudData: Float32Array;
  voxelSize: number;
  globalBounds: {
    minX: number;
    minY: number;
    minZ: number;
  };
}

// Handle voxel debug generation
async function handleVoxelDebug(
  data: VoxelDebugData,
  messageId: number
): Promise<void> {
  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  const startTime = performance.now();
  const result = wasmModule.generate_voxel_centers(
    data.pointCloudData,
    data.voxelSize,
    data.globalBounds.minX,
    data.globalBounds.minY,
    data.globalBounds.minZ
  );
  const processingTime = performance.now() - startTime;
  const voxelCenters = new Float32Array(result);
  const voxelCount = voxelCenters.length / 3;

  const response = {
    type: 'SUCCESS',
    method: 'WASM_RUST',
    messageId,
    data: {
      voxelCenters,
      voxelCount,
      processingTime,
    },
  };

  self.postMessage(response, { transfer: [voxelCenters.buffer] });
}

interface RustWasmWorkerMessage {
  type:
    | 'INITIALIZE'
    | 'VOXEL_DOWNSAMPLE'
    | 'POINT_CLOUD_SMOOTHING'
    | 'VOXEL_DEBUG';
  messageId: number;
  data?: VoxelDownsampleData | PointCloudSmoothingData | VoxelDebugData;
}

// Message handler
self.onmessage = async function (e: MessageEvent<RustWasmWorkerMessage>) {
  const { type, data, messageId } = e.data;

  // Removed logging from hot path for performance

  try {
    switch (type) {
      case 'INITIALIZE':
        Log.Info('RustWasmWorker', 'INITIALIZE message received');
        await initialize();
        const initResponse = {
          type: 'SUCCESS',
          method: 'WASM_RUST',
          messageId,
          data: {
            originalCount: 0,
            processingTime: 0,
          },
        };
        self.postMessage(initResponse);
        break;

      case 'VOXEL_DOWNSAMPLE':
        if (
          !data ||
          !(
            'pointCloudData' in data &&
            'voxelSize' in data &&
            'globalBounds' in data
          )
        ) {
          throw new Error('Invalid VOXEL_DOWNSAMPLE data');
        }
        await handleVoxelDownsampling(data as VoxelDownsampleData, messageId);
        break;

      case 'POINT_CLOUD_SMOOTHING':
        if (
          !data ||
          !(
            'pointCloudData' in data &&
            'smoothingRadius' in data &&
            'iterations' in data
          )
        ) {
          throw new Error('Invalid POINT_CLOUD_SMOOTHING data');
        }
        await handlePointCloudSmoothing(
          data as PointCloudSmoothingData,
          messageId
        );
        break;

      case 'VOXEL_DEBUG':
        if (
          !data ||
          !(
            'pointCloudData' in data &&
            'voxelSize' in data &&
            'globalBounds' in data
          )
        ) {
          throw new Error('Invalid VOXEL_DEBUG data');
        }
        await handleVoxelDebug(data as VoxelDebugData, messageId);
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    Log.Error('RustWasmWorker', 'Error handling message:', error);
    const errorResponse = {
      type: 'ERROR',
      method: 'WASM_RUST',
      messageId,
      data: {
        originalCount: 0,
        processingTime: 0,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    self.postMessage(errorResponse);
  }
};

Log.Info('RustWasmWorker', 'RustWasmWorker Classic Worker loaded');
