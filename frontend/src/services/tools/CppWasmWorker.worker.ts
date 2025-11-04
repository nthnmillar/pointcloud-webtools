// C++ WASM Worker - using exact same pattern as VoxelDownsampleWorker
console.log('[CppWasmWorker] Worker script started');

interface ToolsModule {
  voxelDownsample(inputPoints: Float32Array, voxelSize: number, globalMinX?: number, globalMinY?: number, globalMinZ?: number): Float32Array;
  pointCloudSmoothing(inputPoints: Float32Array, smoothingRadius?: number, iterations?: number): Float32Array;
  showVoxelDebug(inputPoints: Float32Array, voxelSize: number): void;
  getVoxelDebugCenters(): Float32Array | number[];
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
    WorkerLog.info('Starting initialization...');
    
    // Add a timeout to prevent hanging
    let timeoutId: NodeJS.Timeout;
    const initPromise = initializeWasmModule();
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        WorkerLog.error('WASM module initialization timeout');
        reject(new Error('WASM module initialization timeout'));
      }, 15000);
    });
    
    await Promise.race([initPromise, timeoutPromise]);
    
    // Clear the timeout since initialization succeeded
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    WorkerLog.info('WASM module initialized successfully');
  } catch (error) {
    WorkerLog.error('Failed to initialize WASM module', error);
    throw error;
  }
}

async function initializeWasmModule() {
  WorkerLog.info('Loading WASM JS code...');
  
  // Load WASM module using fetch and eval (exact same as VoxelDownsampleWorker)
  const response = await fetch('/wasm/cpp/tools_cpp.js');
  
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM JS: ${response.status} ${response.statusText}`);
  }
  
  const jsCode = await response.text();
  WorkerLog.info('WASM JS code loaded', { length: jsCode.length });

  // Create a module function (exact same as VoxelDownsampleWorker)
  const moduleFunction = new Function('module', 'exports', jsCode);

  // Create module object
  const module = { exports: {} };
  moduleFunction(module, module.exports);

  // Get the ToolsModule function
  const ToolsModuleFactory = (module.exports as { default?: (options?: { locateFile?: (path: string) => string }) => Promise<ToolsModule> }).default || module.exports as (options?: { locateFile?: (path: string) => string }) => Promise<ToolsModule>;

  if (typeof ToolsModuleFactory !== 'function') {
    throw new Error('ToolsModuleFactory is not a function: ' + typeof ToolsModuleFactory);
  }

  WorkerLog.info('ToolsModuleFactory function obtained');
  
  toolsModule = await ToolsModuleFactory({
    locateFile: (path: string) => {
      return path.endsWith('.wasm') ? '/wasm/cpp/tools_cpp.wasm' : path;
    },
  });
  
  WorkerLog.info('ToolsModule instance created');
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

  // Use the optimized voxel downsampling function (now returns Float32Array directly)
  const result = toolsModule.voxelDownsample(
    pointCloudData,
    voxelSize,
    globalBounds.minX,
    globalBounds.minY,
    globalBounds.minZ
  );
  
  // Result is now Float32Array directly - no conversion needed
  const downsampledPoints = result instanceof Float32Array 
    ? result 
    : new Float32Array(result);
  const resultSize = downsampledPoints.length / 3;

  const processingTime = performance.now() - startTime;
  
  WorkerLog.info('Voxel downsampling completed', {
    originalCount: pointCloudData.length / 3,
    downsampledCount: resultSize,
    processingTime
  });

  return {
    downsampledPoints,
    originalCount: pointCloudData.length / 3,
    downsampledCount: resultSize,
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

  let smoothedPoints: Float32Array;
  try {
    smoothedPoints = toolsModule.pointCloudSmoothing(
      pointCloudData,
      smoothingRadius,
      iterations
    );
  } catch (error) {
    WorkerLog.error('C++ WASM pointCloudSmoothing function failed', error);
    throw new Error(`C++ WASM pointCloudSmoothing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

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

  const startTime = performance.now();
  const { pointCloudData, voxelSize } = data;
  
  WorkerLog.info('Processing voxel debug generation', {
    pointCount: pointCloudData.length / 3,
    voxelSize,
    globalBounds: data.globalBounds
  });

  // Use showVoxelDebug to generate voxel centers (pass bounds for identical results)
  toolsModule.showVoxelDebug(
    pointCloudData, 
    voxelSize,
    data.globalBounds.minX,
    data.globalBounds.minY,
    data.globalBounds.minZ
  );
  
  // Get the generated voxel centers
  const voxelCenters = toolsModule.getVoxelDebugCenters();
  
  // Convert to Float32Array if needed
  const centersArray = voxelCenters instanceof Float32Array 
    ? voxelCenters 
    : new Float32Array(voxelCenters || []);

  const processingTime = performance.now() - startTime;
  const voxelCount = centersArray.length / 3;
  
  WorkerLog.info('Voxel debug generation completed', {
    voxelCount,
    processingTime
  });

  return {
    voxelCenters: centersArray,
    voxelCount,
    processingTime
  };
}

// Message handler
self.onmessage = async function(e) {
  const { type, messageId, data } = e.data;
  WorkerLog.info('Received message', { type, messageId });
  
  try {
    if (type === 'INITIALIZE') {
      await initialize();
      self.postMessage({
        type: 'SUCCESS',
        method: 'WASM_CPP',
        messageId,
        data: { originalCount: 0, processingTime: 0 }
      });
    } else if (type === 'VOXEL_DOWNSAMPLE') {
      const result = await processVoxelDownsampling(data);
      self.postMessage({
        type: 'SUCCESS',
        method: 'WASM_CPP',
        messageId,
        data: result
      }, [result.downsampledPoints.buffer]);
    } else if (type === 'POINT_CLOUD_SMOOTHING') {
      const result = await processPointCloudSmoothing(data);
      self.postMessage({
        type: 'SUCCESS',
        method: 'WASM_CPP',
        messageId,
        data: result
      }, [result.smoothedPoints.buffer]);
    } else if (type === 'VOXEL_DEBUG') {
      const result = await processVoxelDebug(data);
      self.postMessage({
        type: 'SUCCESS',
        method: 'WASM_CPP',
        messageId,
        data: result
      }, [result.voxelCenters.buffer]);
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    WorkerLog.error('Error processing message', error);
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