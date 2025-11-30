// Web Worker for Rust WASM processing tools - Classic Worker
import { Log } from '../../utils/Log';

interface PointCloudToolsRust {
  point_cloud_smooth(points: Float64Array, smoothingRadius: number, iterations: number): Float64Array;
  generate_voxel_centers(points: Float32Array, voxelSize: number, minX: number, minY: number, minZ: number): Float64Array;
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
}

interface RustWasmModule {
  default: (wasmPath: string) => Promise<RustWasmInstance>;
  PointCloudToolsRust: (new () => PointCloudToolsRust) & PointCloudToolsRustStatic;
}

let wasmModule: PointCloudToolsRust | null = null;
let wasmInstance: RustWasmInstance | null = null;
let memory: WebAssembly.Memory | null = null;
let heapF32: Float32Array | null = null; // Cached Float32Array view for zero allocation overhead
let voxelDownsampleDirectStaticFunc: ((...args: number[]) => number) | null = null; // Cached static function
let previousOutputPtr: number | null = null;
let previousOutputSize: number = 0;

// Initialize Rust WASM module
async function initialize() {
  try {
    Log.Info('RustWasmWorker', 'Starting Rust WASM initialization...');
    
    // Load WASM JS code using fetch
    const response = await fetch('/wasm/rust/tools_rust.js');
    if (!response.ok) {
      throw new Error(`Failed to fetch Rust WASM JS: ${response.status} ${response.statusText}`);
    }
    
    const jsCode = await response.text();
    Log.Info('RustWasmWorker', 'Rust WASM JS code loaded', { length: jsCode.length });

    // Create a data URL for the module and import it
    const blob = new Blob([jsCode], { type: 'application/javascript' });
    const moduleUrl = URL.createObjectURL(blob);
    
    Log.Info('RustWasmWorker', 'Created module URL:', moduleUrl);
    
    const module = await import(/* @vite-ignore */ moduleUrl) as unknown as RustWasmModule;
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
    if (!wasmInstance.__wbindgen_export_0 || !wasmInstance.__wbindgen_export_1) {
      throw new Error('WASM malloc/free functions not available');
    }
    
    // Cache static function - required, no fallback
    if (typeof PointCloudToolsRust.voxel_downsample_direct_static !== 'function') {
      throw new Error('voxel_downsample_direct_static function not available in Rust WASM module');
    }
    voxelDownsampleDirectStaticFunc = PointCloudToolsRust.voxel_downsample_direct_static;
    
    Log.Info('RustWasmWorker', 'WASM module initialized, creating PointCloudToolsRust instance...');
    
    // Create the Rust tools instance (still needed for other methods)
    wasmModule = new PointCloudToolsRust();
    
    Log.Info('RustWasmWorker', 'PointCloudToolsRust instance created:', wasmModule);
    
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
}

// Handle voxel downsampling
async function handleVoxelDownsampling(data: VoxelDownsampleData, messageId: number): Promise<void> {
  if (!wasmModule || !wasmInstance || !memory) {
    throw new Error('Rust WASM module not initialized');
  }

  const startTime = performance.now();
  const { pointCloudData, voxelSize, globalBounds } = data;
  
  const pointCount = pointCloudData.length / 3;
  const floatCount = pointCloudData.length;
  
  // Free previous output buffer if it exists
  // wasm-bindgen exports free as __wbindgen_export_1(ptr, size, align)
  if (previousOutputPtr !== null && wasmInstance.__wbindgen_export_1) {
    wasmInstance.__wbindgen_export_1(previousOutputPtr, previousOutputSize, 4);
    previousOutputPtr = null;
    previousOutputSize = 0;
  }
  
  // Allocate memory in WASM heap (like C++ does)
  // wasm-bindgen exports malloc as __wbindgen_export_0(size, align)
  const inputPtr = wasmInstance.__wbindgen_export_0(floatCount * 4, 4) >>> 0;
  const outputPtr = wasmInstance.__wbindgen_export_0(floatCount * 4, 4) >>> 0;
  
  if (!inputPtr || !outputPtr) {
    throw new Error(`Failed to allocate WASM memory: inputPtr=${inputPtr}, outputPtr=${outputPtr}`);
  }
  
  // Check if input is already in WASM memory (zero-copy optimization)
  const isInputInWasmMemory = pointCloudData.buffer === memory.buffer;
  let inputPtrToUse = inputPtr;
  
  try {
    if (isInputInWasmMemory) {
      // Input is already in WASM memory - use it directly (zero-copy!)
      inputPtrToUse = pointCloudData.byteOffset;
      // Free the allocated input buffer since we don't need it
      wasmInstance.__wbindgen_export_1(inputPtr, floatCount * 4, 4);
    } else {
      // Input is in JS memory - copy to WASM memory (same as C++)
      // OPTIMIZATION: Use cached heapF32 view instead of creating new Float32Array
      if (!heapF32) {
        heapF32 = new Float32Array(memory.buffer);
      }
      // Refresh view if memory grew (buffer may have changed)
      if (heapF32.buffer !== memory.buffer) {
        heapF32 = new Float32Array(memory.buffer);
      }
      const inputFloatIndex = inputPtr >> 2; // Bit shift is faster than division (same as C++)
      heapF32.set(pointCloudData, inputFloatIndex);
    }
    
    // Use cached static function directly
    if (!voxelDownsampleDirectStaticFunc) {
      throw new Error('voxel_downsample_direct_static function not available');
    }
    const outputCount = voxelDownsampleDirectStaticFunc(
      inputPtrToUse, pointCount, voxelSize,
      globalBounds.minX, globalBounds.minY, globalBounds.minZ, outputPtr
    );
    
    if (outputCount <= 0 || outputCount > pointCount) {
      throw new Error(`Invalid output count: ${outputCount}`);
    }
    
    // OPTIMIZATION: Use cached heapF32 view instead of creating new Float32Array
    // Refresh view if memory grew (buffer may have changed)
    if (!heapF32 || heapF32.buffer !== memory.buffer) {
      heapF32 = new Float32Array(memory.buffer);
    }
    const resultFloatCount = outputCount * 3;
    const outputFloatIndex = outputPtr >> 2; // Bit shift is faster than division (same as C++)
    const downsampledPointsView = heapF32.subarray(outputFloatIndex, outputFloatIndex + resultFloatCount);
    
    // OPTIMIZATION: Copy to new buffer only for transfer (WASM memory cannot be transferred)
    // This is necessary because postMessage cannot transfer WASM/asm.js ArrayBuffers
    // We still get zero-copy benefits during processing, only copy at the end
    const downsampledPoints = new Float32Array(downsampledPointsView);
    
    // Store output pointer and size to keep memory alive
    previousOutputPtr = outputPtr;
    previousOutputSize = floatCount * 4;
    
  const processingTime = performance.now() - startTime;

  const response = {
    type: 'SUCCESS',
    method: 'WASM_RUST',
    messageId,
    data: {
      downsampledPoints,
        originalCount: pointCount,
        downsampledCount: outputCount,
      processingTime
    }
  };

  self.postMessage(response, { transfer: [downsampledPoints.buffer] });
  } finally {
    // Free input memory only if we allocated it (not if it was already in WASM memory)
    // wasm-bindgen exports free as __wbindgen_export_1(ptr, size, align)
    if (!isInputInWasmMemory) {
      wasmInstance.__wbindgen_export_1(inputPtr, floatCount * 4, 4);
    }
  }
}

interface PointCloudSmoothingData {
  pointCloudData: Float32Array;
  smoothingRadius: number;
  iterations: number;
}

// Handle point cloud smoothing
async function handlePointCloudSmoothing(data: PointCloudSmoothingData, messageId: number): Promise<void> {
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

  const response = {
    type: 'SUCCESS',
    method: 'WASM_RUST',
    messageId,
    data: {
      smoothedPoints,
      originalCount: data.pointCloudData.length / 3,
      smoothedCount: smoothedPoints.length / 3,
      processingTime
    }
  };

  self.postMessage(response, { transfer: [smoothedPoints.buffer] });
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
async function handleVoxelDebug(data: VoxelDebugData, messageId: number): Promise<void> {
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
      processingTime
    }
  };

  self.postMessage(response, { transfer: [voxelCenters.buffer] });
}

interface RustWasmWorkerMessage {
  type: 'INITIALIZE' | 'VOXEL_DOWNSAMPLE' | 'POINT_CLOUD_SMOOTHING' | 'VOXEL_DEBUG';
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
            processingTime: 0
          }
        };
        self.postMessage(initResponse);
        break;

      case 'VOXEL_DOWNSAMPLE':
        if (!data || !('pointCloudData' in data && 'voxelSize' in data && 'globalBounds' in data)) {
          throw new Error('Invalid VOXEL_DOWNSAMPLE data');
        }
        await handleVoxelDownsampling(data as VoxelDownsampleData, messageId);
        break;

      case 'POINT_CLOUD_SMOOTHING':
        if (!data || !('pointCloudData' in data && 'smoothingRadius' in data && 'iterations' in data)) {
          throw new Error('Invalid POINT_CLOUD_SMOOTHING data');
        }
        await handlePointCloudSmoothing(data as PointCloudSmoothingData, messageId);
        break;

      case 'VOXEL_DEBUG':
        if (!data || !('pointCloudData' in data && 'voxelSize' in data && 'globalBounds' in data)) {
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
        processingTime: 0
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    self.postMessage(errorResponse);
  }
};

Log.Info('RustWasmWorker', 'RustWasmWorker Classic Worker loaded');




