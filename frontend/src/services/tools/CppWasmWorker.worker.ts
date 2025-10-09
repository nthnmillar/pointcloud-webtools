// C++ WASM Worker - using exact same pattern as VoxelDownsampleWorker
console.log('[CppWasmWorker] Worker script started');

interface ToolsModule {
  voxelDownsample(inputPoints: Float32Array, voxelSize: number, globalMinX?: number, globalMinY?: number, globalMinZ?: number): {
    size(): number;
    get(index: number): { x: number; y: number; z: number };
    at?(index: number): { x: number; y: number; z: number };
    length?: number;
    [index: number]: { x: number; y: number; z: number };
  };
  pointCloudSmoothing(inputPoints: Float32Array, smoothingRadius?: number, iterations?: number): Float32Array;
}

// Simple logging function for worker context
const WorkerLog = {
  info: (message: string, data?: any) => {
    console.log(`[CppWasmWorker] ${message}`, data || '');
  },
  error: (message: string, data?: any) => {
    console.error(`[CppWasmWorker] ERROR: ${message}`, data || '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[CppWasmWorker] WARN: ${message}`, data || '');
  }
};

let toolsModule: ToolsModule | null = null;

// Initialize WASM module (exact same pattern as VoxelDownsampleWorker)
async function initialize() {
  try {
    WorkerLog.info('*** STARTING INITIALIZATION ***');
    
    // Add a timeout to prevent hanging
    WorkerLog.info('Setting up 15-second timeout for initialization');
    let timeoutId: NodeJS.Timeout;
    const initPromise = initializeWasmModule();
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        WorkerLog.error('TIMEOUT: WASM module initialization took longer than 15 seconds');
        reject(new Error('WASM module initialization timeout'));
      }, 15000);
    });
    
    WorkerLog.info('Starting race between initialization and timeout');
    await Promise.race([initPromise, timeoutPromise]);
    
    // Clear the timeout since initialization succeeded
    if (timeoutId) {
      clearTimeout(timeoutId);
      WorkerLog.info('Timeout cleared - initialization completed successfully');
    }
    
    WorkerLog.info('*** WASM MODULE INITIALIZED SUCCESSFULLY ***');
  } catch (error) {
    WorkerLog.error('*** FAILED TO INITIALIZE WASM MODULE ***', error);
    throw error;
  }
}

async function initializeWasmModule() {
  WorkerLog.info('*** STEP 1: Loading WASM JS code from /wasm/cpp/tools_cpp.js ***');
  
  // Load WASM module using fetch and eval (exact same as VoxelDownsampleWorker)
  const response = await fetch('/wasm/cpp/tools_cpp.js');
  WorkerLog.info('Fetch response received', { 
    ok: response.ok, 
    status: response.status, 
    statusText: response.statusText 
  });
  
  if (!response.ok) {
    WorkerLog.error('Fetch failed', { status: response.status, statusText: response.statusText });
    throw new Error(`Failed to fetch WASM JS: ${response.status} ${response.statusText}`);
  }
  
  const jsCode = await response.text();
  WorkerLog.info('*** STEP 2: WASM JS code loaded successfully ***', { length: jsCode.length });

  WorkerLog.info('*** STEP 3: Creating module function with new Function ***');
  // Create a module function (exact same as VoxelDownsampleWorker)
  const moduleFunction = new Function('module', 'exports', jsCode);
  WorkerLog.info('Module function created successfully');

  WorkerLog.info('*** STEP 4: Creating module object and executing function ***');
  // Create module object
  const module = { exports: {} };
  WorkerLog.info('Module object created', { exports: module.exports });
  
  moduleFunction(module, module.exports);
  WorkerLog.info('Module function executed', { exports: module.exports });

  WorkerLog.info('*** STEP 5: Extracting ToolsModuleFactory from module.exports ***');
  // Get the ToolsModule function
  const ToolsModuleFactory = (module.exports as { default?: (options?: { locateFile?: (path: string) => string }) => Promise<ToolsModule> }).default || module.exports as (options?: { locateFile?: (path: string) => string }) => Promise<ToolsModule>;

  WorkerLog.info('ToolsModuleFactory extracted', { 
    type: typeof ToolsModuleFactory,
    isFunction: typeof ToolsModuleFactory === 'function'
  });

  if (typeof ToolsModuleFactory !== 'function') {
    WorkerLog.error('ToolsModuleFactory is not a function', { type: typeof ToolsModuleFactory, value: ToolsModuleFactory });
    throw new Error('ToolsModuleFactory is not a function: ' + typeof ToolsModuleFactory);
  }

  WorkerLog.info('*** STEP 6: ToolsModuleFactory function obtained successfully ***');
  
  WorkerLog.info('*** STEP 7: Calling ToolsModuleFactory with locateFile ***');
  toolsModule = await ToolsModuleFactory({
    locateFile: (path: string) => {
      WorkerLog.info('*** locateFile called ***', { path });
      const resolvedPath = path.endsWith('.wasm') ? '/wasm/cpp/tools_cpp.wasm' : path;
      WorkerLog.info('locateFile resolved path', { original: path, resolved: resolvedPath });
      return resolvedPath;
    },
  });
  
  WorkerLog.info('*** STEP 8: ToolsModule instance created successfully ***', { 
    toolsModule: toolsModule ? 'exists' : 'null',
    hasVoxelDownsample: toolsModule && typeof toolsModule.voxelDownsample === 'function',
    hasPointCloudSmoothing: toolsModule && typeof toolsModule.pointCloudSmoothing === 'function'
  });
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

  const startTime = performance.now();
  const { pointCloudData, voxelSize, globalBounds } = data;
  
  WorkerLog.info('Processing voxel downsampling', {
    pointCount: pointCloudData.length / 3,
    voxelSize,
    globalBounds
  });

  const result = toolsModule.voxelDownsample(
    pointCloudData,
    voxelSize,
    globalBounds.minX,
    globalBounds.minY,
    globalBounds.minZ
  );

  const downsampledPoints = new Float32Array(result.size() * 3);
  for (let i = 0; i < result.size(); i++) {
    const point = result.get(i);
    downsampledPoints[i * 3] = point.x;
    downsampledPoints[i * 3 + 1] = point.y;
    downsampledPoints[i * 3 + 2] = point.z;
  }

  const processingTime = performance.now() - startTime;
  
  WorkerLog.info('Voxel downsampling completed', {
    originalCount: pointCloudData.length / 3,
    downsampledCount: result.size(),
    processingTime
  });

  return {
    downsampledPoints,
    originalCount: pointCloudData.length / 3,
    downsampledCount: result.size(),
    processingTime
  };
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
  
  WorkerLog.info('Processing point cloud smoothing', {
    pointCount: pointCloudData.length / 3,
    smoothingRadius,
    iterations
  });

  const smoothedPoints = toolsModule.pointCloudSmoothing(
    pointCloudData,
    smoothingRadius,
    iterations
  );

  const processingTime = performance.now() - startTime;
  
  WorkerLog.info('Point cloud smoothing completed', {
    originalCount: pointCloudData.length / 3,
    smoothedCount: smoothedPoints.length / 3,
    processingTime
  });

  return {
    smoothedPoints,
    originalCount: pointCloudData.length / 3,
    smoothedCount: smoothedPoints.length / 3,
    processingTime
  };
}

// Message handler
self.onmessage = async function(e) {
  const { type, messageId, data } = e.data;
  WorkerLog.info('*** MESSAGE RECEIVED ***', { type, messageId, hasData: !!data, fullData: e.data });
  
  try {
    if (type === 'INITIALIZE') {
      WorkerLog.info('*** HANDLING INITIALIZE MESSAGE ***');
      await initialize();
      WorkerLog.info('*** INITIALIZATION COMPLETE - SENDING SUCCESS RESPONSE ***');
      const response = {
        type: 'SUCCESS',
        method: 'WASM_CPP',
        messageId,
        data: { originalCount: 0, processingTime: 0 }
      };
      WorkerLog.info('Sending response to main thread', response);
      self.postMessage(response);
    } else if (type === 'VOXEL_DOWNSAMPLE') {
      WorkerLog.info('*** HANDLING VOXEL_DOWNSAMPLE MESSAGE ***');
      const result = await processVoxelDownsampling(data);
      WorkerLog.info('*** VOXEL DOWNSAMPLING COMPLETE - SENDING SUCCESS RESPONSE ***');
      self.postMessage({
        type: 'SUCCESS',
        method: 'WASM_CPP',
        messageId,
        data: result
      }, [result.downsampledPoints.buffer]);
    } else if (type === 'POINT_CLOUD_SMOOTHING') {
      WorkerLog.info('*** HANDLING POINT_CLOUD_SMOOTHING MESSAGE ***');
      const result = await processPointCloudSmoothing(data);
      WorkerLog.info('*** POINT CLOUD SMOOTHING COMPLETE - SENDING SUCCESS RESPONSE ***');
      self.postMessage({
        type: 'SUCCESS',
        method: 'WASM_CPP',
        messageId,
        data: result
      }, [result.smoothedPoints.buffer]);
    } else {
      WorkerLog.error('*** UNKNOWN MESSAGE TYPE ***', { type });
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    WorkerLog.error('*** ERROR PROCESSING MESSAGE ***', error);
    self.postMessage({
      type: 'ERROR',
      method: 'WASM_CPP',
      messageId,
      data: { originalCount: 0, processingTime: 0 },
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

console.log('[CppWasmWorker] Worker script loaded and ready');

// Send a ready signal to main thread
self.postMessage({
  type: 'WORKER_READY',
  method: 'WASM_CPP',
  messageId: -1,
  data: { originalCount: 0, processingTime: 0 }
});