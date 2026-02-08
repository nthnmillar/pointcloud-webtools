// C++ WASM Worker - using exact same pattern as VoxelDownsampleWorker
import { Log } from '../../utils/Log';

Log.Info('CppWasmWorker', 'Worker script started');

interface ToolsModule {
  voxelDownsample(
    inputPoints: Float32Array,
    voxelSize: number,
    globalMinX?: number,
    globalMinY?: number,
    globalMinZ?: number
  ): Float32Array;
  pointCloudSmoothing(
    inputPoints: Float32Array,
    smoothingRadius?: number,
    iterations?: number
  ): Float32Array;
  showVoxelDebug(inputPoints: Float32Array, voxelSize: number): void;
  getVoxelDebugCenters(): Float32Array | number[];
  // Direct memory access functions
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPF32: Float32Array;
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

let toolsModule: (ToolsModule & { HEAPU8?: Uint8Array }) | null = null;
let voxelDownsampleDirectFunc: ((...args: number[]) => number) | null = null;
let voxelDownsampleDirectWithColorsFunc: ((...args: number[]) => number) | null = null;
let voxelDownsampleDirectWithAttributesFunc: ((...args: number[]) => number) | null = null;
let voxelDebugDirectFunc: ((...args: number[]) => number) | null = null;
let previousOutputPtr: number | null = null;
let previousOutputColorPtr: number | null = null;
let previousOutputIntensityPtr: number | null = null;
let previousOutputClassificationPtr: number | null = null;

// Initialize WASM module (exact same pattern as VoxelDownsampleWorker)
async function initialize() {
  try {
    Log.Info('CppWasmWorker', 'Starting initialization...');

    // Add a timeout to prevent hanging
    let timeoutId: NodeJS.Timeout | undefined;
    const initPromise = initializeWasmModule();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        Log.Error('CppWasmWorker', 'WASM module initialization timeout');
        reject(new Error('WASM module initialization timeout'));
      }, 15000);
    });

    await Promise.race([initPromise, timeoutPromise]);

    // Clear the timeout since initialization succeeded
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    Log.Info('CppWasmWorker', 'WASM module initialized successfully');
  } catch (error) {
    Log.Error('CppWasmWorker', 'Failed to initialize WASM module', error);
    throw error;
  }
}

async function initializeWasmModule() {
  Log.Info('CppWasmWorker', 'Loading WASM JS code...');

  // Load WASM module using fetch and eval (exact same as VoxelDownsampleWorker)
  const response = await fetch('/wasm/cpp/tools_cpp.js');

  if (!response.ok) {
    throw new Error(
      `Failed to fetch WASM JS: ${response.status} ${response.statusText}`
    );
  }

  const jsCode = await response.text();
  Log.Info('CppWasmWorker', 'WASM JS code loaded', { length: jsCode.length });

  // Create a module function (exact same as VoxelDownsampleWorker)
  const moduleFunction = new Function('module', 'exports', jsCode);

  // Create module object
  const module = { exports: {} };
  moduleFunction(module, module.exports);

  // Get the ToolsModule function
  const ToolsModuleFactory =
    (
      module.exports as {
        default?: (options?: {
          locateFile?: (path: string) => string;
        }) => Promise<ToolsModule>;
      }
    ).default ||
    (module.exports as (options?: {
      locateFile?: (path: string) => string;
    }) => Promise<ToolsModule>);

  if (typeof ToolsModuleFactory !== 'function') {
    throw new Error(
      'ToolsModuleFactory is not a function: ' + typeof ToolsModuleFactory
    );
  }

  Log.Info('CppWasmWorker', 'ToolsModuleFactory function obtained');

  toolsModule = await ToolsModuleFactory({
    locateFile: (path: string) => {
      return path.endsWith('.wasm') ? '/wasm/cpp/tools_cpp.wasm' : path;
    },
  });

  if (toolsModule.cwrap) {
    voxelDownsampleDirectFunc = toolsModule.cwrap(
      'voxelDownsampleDirect',
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number']
    );
    voxelDownsampleDirectWithColorsFunc = toolsModule.cwrap(
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
    voxelDownsampleDirectWithAttributesFunc = toolsModule.cwrap(
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
    voxelDebugDirectFunc = toolsModule.cwrap(
      'voxelDebugDirect',
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
      ]
    );
    Log.Info(
      'CppWasmWorker',
      'Functions wrapped with cwrap for better performance'
    );
  }

  Log.Info('CppWasmWorker', 'ToolsModule instance created');
}

// Process voxel downsampling (supports full attributes: colors, intensities, classifications)
async function processVoxelDownsampling(data: {
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
  colors?: Float32Array;
  intensities?: Float32Array;
  classifications?: Uint8Array;
}) {
  if (!toolsModule) {
    throw new Error('WASM module not initialized');
  }

  if (!toolsModule._malloc || !toolsModule._free || !toolsModule.HEAPF32) {
    throw new Error(
      'Required WASM functions not available. Missing: ' +
        (!toolsModule._malloc ? '_malloc ' : '') +
        (!toolsModule._free ? '_free ' : '') +
        (!toolsModule.HEAPF32 ? 'HEAPF32' : '')
    );
  }

  const startTime = performance.now();
  const { pointCloudData, voxelSize, globalBounds, colors, intensities, classifications } = data;
  const pointCount = pointCloudData.length / 3;
  const floatCount = pointCloudData.length;
  const useColors = colors != null && colors.length === pointCount * 3;
  const useIntensity = intensities != null && intensities.length === pointCount;
  const useClassification =
    classifications != null &&
    classifications.length === pointCount &&
    toolsModule.HEAPU8 != null;
  const useAttributes =
    (useColors || useIntensity || useClassification) &&
    voxelDownsampleDirectWithAttributesFunc != null;

  if (previousOutputPtr !== null) {
    toolsModule._free(previousOutputPtr);
    previousOutputPtr = null;
  }
  if (previousOutputColorPtr !== null) {
    toolsModule._free(previousOutputColorPtr);
    previousOutputColorPtr = null;
  }
  if (previousOutputIntensityPtr !== null) {
    toolsModule._free(previousOutputIntensityPtr);
    previousOutputIntensityPtr = null;
  }
  if (previousOutputClassificationPtr !== null) {
    toolsModule._free(previousOutputClassificationPtr);
    previousOutputClassificationPtr = null;
  }

  const inputPtr = toolsModule._malloc(floatCount * 4);
  const outputPtr = toolsModule._malloc(floatCount * 4);
  let inputColorPtr = 0;
  let outputColorPtr = 0;
  let inputIntensityPtr = 0;
  let outputIntensityPtr = 0;
  let inputClassPtr = 0;
  let outputClassPtr = 0;

  if (useAttributes) {
    if (useColors && colors) {
      inputColorPtr = toolsModule._malloc(pointCount * 3 * 4);
      outputColorPtr = toolsModule._malloc(floatCount * 4);
    }
    if (useIntensity && intensities) {
      inputIntensityPtr = toolsModule._malloc(pointCount * 4);
      outputIntensityPtr = toolsModule._malloc(floatCount * 4);
    }
    if (useClassification && classifications && toolsModule.HEAPU8) {
      inputClassPtr = toolsModule._malloc(pointCount);
      outputClassPtr = toolsModule._malloc(pointCount);
    }
  } else if (useColors && colors && voxelDownsampleDirectWithColorsFunc) {
    inputColorPtr = toolsModule._malloc(pointCount * 3 * 4);
    outputColorPtr = toolsModule._malloc(floatCount * 4);
  }

  if (!inputPtr || !outputPtr) {
    if (inputColorPtr) toolsModule._free(inputColorPtr);
    if (outputColorPtr) toolsModule._free(outputColorPtr);
    if (inputIntensityPtr) toolsModule._free(inputIntensityPtr);
    if (outputIntensityPtr) toolsModule._free(outputIntensityPtr);
    if (inputClassPtr) toolsModule._free(inputClassPtr);
    if (outputClassPtr) toolsModule._free(outputClassPtr);
    throw new Error(
      `Failed to allocate WASM memory: inputPtr=${inputPtr}, outputPtr=${outputPtr}`
    );
  }

  const isInputInWasmMemory =
    pointCloudData.buffer === toolsModule.HEAPF32.buffer;
  let inputPtrToUse = inputPtr;

  try {
    if (isInputInWasmMemory) {
      inputPtrToUse = pointCloudData.byteOffset;
      toolsModule._free(inputPtr);
    } else {
      toolsModule.HEAPF32.set(pointCloudData, inputPtr >> 2);
    }

    if (useColors && colors && inputColorPtr) {
      toolsModule.HEAPF32.set(colors, inputColorPtr >> 2);
    }
    if (useIntensity && intensities && inputIntensityPtr) {
      toolsModule.HEAPF32.set(intensities, inputIntensityPtr >> 2);
    }
    if (useClassification && classifications && inputClassPtr && toolsModule.HEAPU8) {
      toolsModule.HEAPU8.set(classifications, inputClassPtr);
    }

    let outputCount: number;
    if (useAttributes && voxelDownsampleDirectWithAttributesFunc) {
      outputCount = voxelDownsampleDirectWithAttributesFunc(
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
    } else if (
      useColors &&
      inputColorPtr &&
      outputColorPtr &&
      voxelDownsampleDirectWithColorsFunc
    ) {
      outputCount = voxelDownsampleDirectWithColorsFunc(
        inputPtrToUse,
        inputColorPtr,
        pointCount,
        voxelSize,
        globalBounds.minX,
        globalBounds.minY,
        globalBounds.minZ,
        outputPtr,
        outputColorPtr
      );
    } else {
      outputCount = voxelDownsampleDirectFunc
        ? voxelDownsampleDirectFunc(
            inputPtrToUse,
            pointCount,
            voxelSize,
            globalBounds.minX,
            globalBounds.minY,
            globalBounds.minZ,
            outputPtr
          )
        : (() => {
            const ccall = (toolsModule as { ccall?: (name: string, ret: string, types: string[], args: number[]) => number }).ccall;
            if (ccall) {
              return ccall(
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
                  voxelSize,
                  globalBounds.minX,
                  globalBounds.minY,
                  globalBounds.minZ,
                  outputPtr,
                ]
              );
            }
            throw new Error('No direct function available');
          })();
    }

    if (outputCount <= 0 || outputCount > pointCount) {
      throw new Error(
        `Invalid output count: ${outputCount} (expected 1-${pointCount})`
      );
    }

    const resultFloatCount = outputCount * 3;
    const outputFloatIndex = outputPtr >> 2;
    const downsampledPoints = new Float32Array(
      toolsModule.HEAPF32.subarray(
        outputFloatIndex,
        outputFloatIndex + resultFloatCount
      )
    );

    previousOutputPtr = outputPtr;

    let downsampledColors: Float32Array | undefined;
    let downsampledIntensities: Float32Array | undefined;
    let downsampledClassifications: Uint8Array | undefined;

    if (useColors && outputColorPtr) {
      previousOutputColorPtr = outputColorPtr;
      downsampledColors = new Float32Array(
        toolsModule.HEAPF32.subarray(
          outputColorPtr >> 2,
          (outputColorPtr >> 2) + resultFloatCount
        )
      );
    }
    if (useIntensity && outputIntensityPtr) {
      previousOutputIntensityPtr = outputIntensityPtr;
      downsampledIntensities = new Float32Array(
        toolsModule.HEAPF32.subarray(
          outputIntensityPtr >> 2,
          (outputIntensityPtr >> 2) + outputCount
        )
      );
    }
    if (useClassification && outputClassPtr && toolsModule.HEAPU8) {
      previousOutputClassificationPtr = outputClassPtr;
      downsampledClassifications = toolsModule.HEAPU8.subarray(
        outputClassPtr,
        outputClassPtr + outputCount
      ).slice(0);
    }

    const processingTime = performance.now() - startTime;

    return {
      downsampledPoints,
      downsampledColors,
      downsampledIntensities,
      downsampledClassifications,
      originalCount: pointCount,
      downsampledCount: outputCount,
      processingTime,
    };
  } finally {
    if (!isInputInWasmMemory && inputPtr) {
      toolsModule._free(inputPtr);
    }
    if (inputColorPtr) {
      toolsModule._free(inputColorPtr);
    }
    if (inputIntensityPtr) {
      toolsModule._free(inputIntensityPtr);
    }
    if (inputClassPtr) {
      toolsModule._free(inputClassPtr);
    }
  }
}

// Process point cloud smoothing
async function processPointCloudSmoothing(data: {
  pointCloudData: Float32Array;
  smoothingRadius: number;
  iterations: number;
  colors?: Float32Array;
  intensities?: Float32Array;
  classifications?: Uint8Array;
}) {
  if (!toolsModule) {
    throw new Error('WASM module not initialized');
  }

  const startTime = performance.now();
  const { pointCloudData, smoothingRadius, iterations, colors, intensities, classifications } = data;

  Log.Info('CppWasmWorker', 'Processing point cloud smoothing', {
    pointCount: pointCloudData.length / 3,
    smoothingRadius,
    iterations,
  });

  let smoothedPoints: Float32Array;
  try {
    smoothedPoints = toolsModule.pointCloudSmoothing(
      pointCloudData,
      smoothingRadius,
      iterations
    );
  } catch (error) {
    Log.Error(
      'CppWasmWorker',
      'C++ WASM pointCloudSmoothing function failed',
      error
    );
    throw new Error(
      `C++ WASM pointCloudSmoothing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  const processingTime = performance.now() - startTime;
  const pointCount = smoothedPoints.length / 3;
  // Pass through attributes (point count and order unchanged)
  const smoothedColors =
    colors != null && colors.length === pointCount * 3
      ? new Float32Array(colors)
      : undefined;
  const smoothedIntensities =
    intensities != null && intensities.length === pointCount
      ? new Float32Array(intensities)
      : undefined;
  const smoothedClassifications =
    classifications != null && classifications.length === pointCount
      ? new Uint8Array(classifications)
      : undefined;

  Log.Info('CppWasmWorker', 'Point cloud smoothing completed', {
    originalCount: pointCloudData.length / 3,
    smoothedCount: pointCount,
    processingTime,
  });

  return {
    smoothedPoints,
    smoothedColors,
    smoothedIntensities,
    smoothedClassifications,
    originalCount: pointCloudData.length / 3,
    smoothedCount: pointCount,
    processingTime,
  };
}

// Process voxel debug generation
async function processVoxelDebug(data: {
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
}) {
  if (!toolsModule) {
    throw new Error('WASM module not initialized');
  }

  // Check if required functions are available
  if (!toolsModule._malloc || !toolsModule._free || !toolsModule.HEAPF32) {
    throw new Error('Required WASM functions not available');
  }

  const startTime = performance.now();
  const { pointCloudData, voxelSize, globalBounds } = data;

  Log.Info('CppWasmWorker', 'Processing voxel debug generation', {
    pointCount: pointCloudData.length / 3,
    voxelSize,
    globalBounds,
  });

  const pointCount = pointCloudData.length / 3;
  const floatCount = pointCloudData.length;

  // Free previous output buffer if it exists
  if (previousOutputPtr !== null) {
    toolsModule._free(previousOutputPtr);
    previousOutputPtr = null;
  }

  // Allocate memory in WASM heap for input and output
  const inputPtr = toolsModule._malloc(floatCount * 4); // 4 bytes per float
  const outputPtr = toolsModule._malloc(floatCount * 4); // Worst-case: same size as input

  if (!inputPtr || !outputPtr) {
    throw new Error(
      `Failed to allocate WASM memory: inputPtr=${inputPtr}, outputPtr=${outputPtr}`
    );
  }

  // OPTIMIZATION: Check if input is already in WASM memory (zero-copy optimization)
  const isInputInWasmMemory =
    pointCloudData.buffer === toolsModule.HEAPF32.buffer;
  let inputPtrToUse = inputPtr;

  try {
    if (isInputInWasmMemory) {
      // Input is already in WASM memory - use it directly (zero-copy!)
      inputPtrToUse = pointCloudData.byteOffset;
      // Free the allocated input buffer since we don't need it
      toolsModule._free(inputPtr);
    } else {
      // OPTIMIZATION: Bulk copy input data using HEAPF32.set()
      const inputFloatIndex = inputPtr >> 2; // Convert byte pointer to float index
      toolsModule.HEAPF32.set(pointCloudData, inputFloatIndex);
    }

    // OPTIMIZATION: Use cached wrapped function (cwrap) instead of ccall for better performance
    const outputCount = voxelDebugDirectFunc
      ? voxelDebugDirectFunc(
          inputPtrToUse, // inputPtr (byte pointer, C will cast to float*)
          pointCount, // pointCount
          voxelSize, // voxelSize
          globalBounds.minX, // minX
          globalBounds.minY, // minY
          globalBounds.minZ, // minZ
          outputPtr, // outputPtr (byte pointer, C will cast to float*)
          pointCount // maxOutputPoints (safety limit)
        )
      : toolsModule.ccall
        ? toolsModule.ccall(
            'voxelDebugDirect',
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
            ],
            [
              inputPtrToUse,
              pointCount,
              voxelSize,
              globalBounds.minX,
              globalBounds.minY,
              globalBounds.minZ,
              outputPtr,
              pointCount,
            ]
          )
        : (() => {
            throw new Error('No direct function available');
          })();

    if (outputCount <= 0 || outputCount > pointCount) {
      throw new Error(
        `Invalid output count: ${outputCount} (expected 1-${pointCount})`
      );
    }

    // ZERO-COPY OUTPUT: Create direct view of WASM memory
    const resultFloatCount = outputCount * 3;
    const outputFloatIndex = outputPtr >> 2;
    const centersArray = toolsModule.HEAPF32.subarray(
      outputFloatIndex,
      outputFloatIndex + resultFloatCount
    );

    // Copy to new buffer for transfer (WASM memory cannot be transferred)
    const centersArrayCopy = new Float32Array(centersArray);

    // Store output pointer to keep WASM memory alive
    previousOutputPtr = outputPtr;

    const processingTime = performance.now() - startTime;
    const voxelCount = outputCount;

    Log.Info('CppWasmWorker', 'Voxel debug generation completed', {
      voxelCount,
      processingTime,
    });

    return {
      voxelCenters: centersArrayCopy,
      voxelCount,
      processingTime,
    };
  } catch (error) {
    // Free allocated memory on error
    if (inputPtr && !isInputInWasmMemory) {
      toolsModule._free(inputPtr);
    }
    if (outputPtr) {
      toolsModule._free(outputPtr);
    }
    throw error;
  }
}

// Message handler
self.onmessage = async function (e) {
  const { type, messageId, data } = e.data;
  // Removed logging from hot path for performance

  try {
    if (type === 'INITIALIZE') {
      await initialize();
      self.postMessage({
        type: 'SUCCESS',
        method: 'WASM_CPP',
        messageId,
        data: { originalCount: 0, processingTime: 0 },
      });
    } else if (type === 'VOXEL_DOWNSAMPLE') {
      const result = await processVoxelDownsampling(data);
      const transfer: Transferable[] = [result.downsampledPoints.buffer];
      if (result.downsampledColors) {
        transfer.push(result.downsampledColors.buffer);
      }
      if (result.downsampledIntensities) {
        transfer.push(result.downsampledIntensities.buffer);
      }
      if (result.downsampledClassifications) {
        transfer.push(result.downsampledClassifications.buffer);
      }
      globalThis.postMessage(
        {
          type: 'SUCCESS',
          method: 'WASM_CPP',
          messageId,
          data: result,
        },
        { transfer }
      );
    } else if (type === 'POINT_CLOUD_SMOOTHING') {
      const result = await processPointCloudSmoothing(data);
      const transfer: Transferable[] = [result.smoothedPoints.buffer];
      if (result.smoothedColors) transfer.push(result.smoothedColors.buffer);
      if (result.smoothedIntensities) transfer.push(result.smoothedIntensities.buffer);
      if (result.smoothedClassifications) transfer.push(result.smoothedClassifications.buffer);
      globalThis.postMessage(
        {
          type: 'SUCCESS',
          method: 'WASM_CPP',
          messageId,
          data: result,
        },
        { transfer }
      );
    } else if (type === 'VOXEL_DEBUG') {
      const result = await processVoxelDebug(data);
      globalThis.postMessage(
        {
          type: 'SUCCESS',
          method: 'WASM_CPP',
          messageId,
          data: result,
        },
        { transfer: [result.voxelCenters.buffer] }
      );
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    Log.Error('CppWasmWorker', 'Error processing message', error);
    self.postMessage({
      type: 'ERROR',
      method: 'WASM_CPP',
      messageId,
      data: { originalCount: 0, processingTime: 0 },
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

Log.Info('CppWasmWorker', 'Worker script loaded and ready');

// Send a ready signal to main thread
self.postMessage({
  type: 'WORKER_READY',
  method: 'WASM_CPP',
  messageId: -1,
  data: { originalCount: 0, processingTime: 0 },
});
