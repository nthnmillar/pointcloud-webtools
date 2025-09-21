// Web Worker for Voxel Downsampling processing
let voxelModule: any = null;

// Initialize WASM module
async function initialize() {
  try {
    console.log('VoxelDownsampleWorker: Starting initialization...');
    
    // Add a timeout to prevent hanging
    const initPromise = initializeWasmModule();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('WASM module initialization timeout')), 15000);
    });
    
    await Promise.race([initPromise, timeoutPromise]);
    
    console.log('VoxelDownsampleWorker: WASM module initialized successfully');
    
    // Send initialization complete
    self.postMessage({
      type: 'WORKER_INITIALIZED',
      data: { success: true }
    });
  } catch (error) {
    console.error('VoxelDownsampleWorker: Failed to initialize WASM module:', error);
    console.error('VoxelDownsampleWorker: Error details:', error);
    self.postMessage({
      type: 'ERROR',
      data: {
        error: error instanceof Error ? error.message : 'Failed to initialize WASM module',
      },
    });
  }
}

async function initializeWasmModule() {
  console.log('VoxelDownsampleWorker: Loading WASM JS code...');
  
  // Load WASM module using fetch and eval (similar to VoxelDownsampling.ts)
  const response = await fetch('/wasm/voxel_downsampling.js');
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM JS: ${response.status} ${response.statusText}`);
  }
  
  const jsCode = await response.text();
  console.log('VoxelDownsampleWorker: WASM JS code loaded, length:', jsCode.length);

  // Create a module function
  const moduleFunction = new Function('module', 'exports', jsCode);

  // Create module object
  const module = { exports: {} };
  moduleFunction(module, module.exports);

  // Get the VoxelModule function
  const VoxelModule = (module.exports as { default?: (options?: { locateFile?: (path: string) => string }) => Promise<any> }).default || module.exports as (options?: { locateFile?: (path: string) => string }) => Promise<any>;

  if (typeof VoxelModule !== 'function') {
    throw new Error('VoxelModule is not a function: ' + typeof VoxelModule);
  }

  console.log('VoxelDownsampleWorker: VoxelModule function obtained');
  
  voxelModule = await VoxelModule({
    locateFile: (path: string) => {
      console.log('VoxelDownsampleWorker: locateFile called with path:', path);
      return path.endsWith('.wasm') ? '/wasm/voxel_downsampling.wasm' : path;
    },
  });
  
  console.log('VoxelDownsampleWorker: VoxelModule instance created');
}

// Process a single batch of points
async function processBatch(batchData: {
  batchId: string;
  points: Float32Array;
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
  if (!voxelModule) {
    throw new Error('WASM module not initialized');
  }

  const startTime = performance.now();

  try {
    // Call the WASM function
    const downsampledPoints = voxelModule.voxelDownsample(
      batchData.points,
      batchData.voxelSize,
      batchData.globalBounds.minX,
      batchData.globalBounds.minY,
      batchData.globalBounds.minZ
    );

    // Convert Emscripten vector back to Float32Array
    let resultLength = 0;
    if (typeof downsampledPoints.size === 'function') {
      resultLength = downsampledPoints.size();
    } else if (downsampledPoints.length) {
      resultLength = downsampledPoints.length;
    }

    const downsampledFloat32 = new Float32Array(resultLength * 3);

    for (let i = 0; i < resultLength; i++) {
      let point;
      if (typeof downsampledPoints.get === 'function') {
        point = downsampledPoints.get(i);
      } else if (typeof downsampledPoints.at === 'function') {
        point = downsampledPoints.at(i);
      } else if (downsampledPoints[i]) {
        point = downsampledPoints[i];
      } else {
        continue;
      }

      if (point && typeof point.x === 'number') {
        downsampledFloat32[i * 3] = point.x;
        downsampledFloat32[i * 3 + 1] = point.y;
        downsampledFloat32[i * 3 + 2] = point.z;
      }
    }

    const processingTime = performance.now() - startTime;

    // Send batch result
    self.postMessage({
      type: 'BATCH_COMPLETE',
      data: {
        batchId: batchData.batchId,
        downsampledPoints: downsampledFloat32,
        originalCount: batchData.points.length / 3,
        downsampledCount: resultLength,
        processingTime: processingTime,
        success: true
      }
    });

  } catch (error) {
    console.error('VoxelDownsampleWorker: Batch processing failed:', error);
    self.postMessage({
      type: 'BATCH_ERROR',
      data: {
        batchId: batchData.batchId,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }
    });
  }
}

// Message handler
self.onmessage = async function (e) {
  const { type, data } = e.data;
  console.log('VoxelDownsampleWorker: Received message:', type, data);

  try {
    switch (type) {
      case 'INITIALIZE':
        console.log('VoxelDownsampleWorker: Starting initialization...');
        await initialize();
        break;

      case 'PROCESS_BATCH':
        console.log('VoxelDownsampleWorker: Processing batch...');
        await processBatch(data);
        break;

      default:
        console.warn('VoxelDownsampleWorker: Unknown message type:', type);
    }
  } catch (error) {
    console.error('VoxelDownsampleWorker: Error handling message:', error);
    console.error('VoxelDownsampleWorker: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    self.postMessage({
      type: 'ERROR',
      data: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
};
