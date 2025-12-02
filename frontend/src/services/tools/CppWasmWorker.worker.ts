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

let toolsModule: ToolsModule | null = null;
let voxelDownsampleDirectFunc: ((...args: number[]) => number) | null = null; // Cached wrapped function
let voxelDebugDirectFunc: ((...args: number[]) => number) | null = null; // Cached wrapped function for voxel debug
let previousOutputPtr: number | null = null; // Track output pointer for memory management

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

  // OPTIMIZATION: Pre-wrap the function to avoid ccall overhead on every call
  // cwrap caches the function pointer and reduces call overhead
  if (toolsModule.cwrap) {
    voxelDownsampleDirectFunc = toolsModule.cwrap(
      'voxelDownsampleDirect',
      'number', // Return type: int
      ['number', 'number', 'number', 'number', 'number', 'number', 'number'] // Parameter types
    );
    voxelDebugDirectFunc = toolsModule.cwrap(
      'voxelDebugDirect',
      'number', // Return type: int
      [
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
      ] // Parameter types
    );
    Log.Info(
      'CppWasmWorker',
      'Functions wrapped with cwrap for better performance'
    );
  }

  Log.Info('CppWasmWorker', 'ToolsModule instance created');
}

// Process voxel downsampling
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
}) {
  if (!toolsModule) {
    throw new Error('WASM module not initialized');
  }

  // Check if required functions are available
  if (!toolsModule._malloc || !toolsModule._free || !toolsModule.HEAPF32) {
    throw new Error(
      'Required WASM functions not available. Missing: ' +
        (!toolsModule._malloc ? '_malloc ' : '') +
        (!toolsModule._free ? '_free ' : '') +
        (!toolsModule.HEAPF32 ? 'HEAPF32' : '')
    );
  }

  const startTime = performance.now();
  const { pointCloudData, voxelSize, globalBounds } = data;

  const pointCount = pointCloudData.length / 3;
  const floatCount = pointCloudData.length;

  // Free previous output buffer if it exists (keep only one result alive at a time)
  if (previousOutputPtr !== null) {
    toolsModule._free(previousOutputPtr);
    previousOutputPtr = null;
  }

  // Allocate memory in WASM heap for input and output
  // Note: Output buffer must be worst-case (same as input) to avoid buffer overflow
  const inputPtr = toolsModule._malloc(floatCount * 4); // 4 bytes per float
  const outputPtr = toolsModule._malloc(floatCount * 4); // Worst-case: same size as input (safe)

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
      // This is much faster than element-by-element copy
      const inputFloatIndex = inputPtr >> 2; // Convert byte pointer to float index
      toolsModule.HEAPF32.set(pointCloudData, inputFloatIndex);
    }

    // OPTIMIZATION: Use cached wrapped function (cwrap) instead of ccall for better performance
    // cwrap reduces function call overhead by caching the function pointer
    const outputCount = voxelDownsampleDirectFunc
      ? voxelDownsampleDirectFunc(
          inputPtrToUse, // inputPtr (byte pointer, C will cast to float*)
          pointCount, // pointCount
          voxelSize, // voxelSize
          globalBounds.minX, // globalMinX
          globalBounds.minY, // globalMinY
          globalBounds.minZ, // globalMinZ
          outputPtr // outputPtr (byte pointer, C will cast to float*)
        )
      : toolsModule.ccall
        ? toolsModule.ccall(
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
    // Store output pointer to keep WASM memory alive - don't free it immediately
    const resultFloatCount = outputCount * 3;
    const outputFloatIndex = outputPtr >> 2;

    // Create zero-copy view of WASM memory for processing
    const downsampledPointsView = toolsModule.HEAPF32.subarray(
      outputFloatIndex,
      outputFloatIndex + resultFloatCount
    );

    // OPTIMIZATION: Copy to new buffer only for transfer (WASM memory cannot be transferred)
    // This is necessary because postMessage cannot transfer WASM/asm.js ArrayBuffers
    // We still get zero-copy benefits during processing, only copy at the end
    const downsampledPoints = new Float32Array(downsampledPointsView);

    // Store output pointer to keep memory alive (for the view, even though we copied)
    // Previous output pointer was already freed above
    previousOutputPtr = outputPtr;

    const processingTime = performance.now() - startTime;

    return {
      downsampledPoints,
      originalCount: pointCount,
      downsampledCount: outputCount,
      processingTime,
    };
  } finally {
    // Free input memory only if we allocated it (not if it was already in WASM memory)
    if (!isInputInWasmMemory && inputPtr) {
      toolsModule._free(inputPtr);
    }
    // Note: outputPtr is NOT freed here - it's stored in previousOutputPtr and freed on next call
  }
}

// Process point cloud smoothing
async function processPointCloudSmoothing(data: {
  pointCloudData: Float32Array;
  smoothingRadius: number;
  iterations: number;
}) {
  if (!toolsModule) {
    throw new Error('WASM module not initialized');
  }

  const startTime = performance.now();
  const { pointCloudData, smoothingRadius, iterations } = data;

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

  Log.Info('CppWasmWorker', 'Point cloud smoothing completed', {
    originalCount: pointCloudData.length / 3,
    smoothedCount: smoothedPoints.length / 3,
    processingTime,
  });

  return {
    smoothedPoints,
    originalCount: pointCloudData.length / 3,
    smoothedCount: smoothedPoints.length / 3,
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
      globalThis.postMessage(
        {
          type: 'SUCCESS',
          method: 'WASM_CPP',
          messageId,
          data: result,
        },
        { transfer: [result.downsampledPoints.buffer] }
      );
    } else if (type === 'POINT_CLOUD_SMOOTHING') {
      const result = await processPointCloudSmoothing(data);
      globalThis.postMessage(
        {
          type: 'SUCCESS',
          method: 'WASM_CPP',
          messageId,
          data: result,
        },
        { transfer: [result.smoothedPoints.buffer] }
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
