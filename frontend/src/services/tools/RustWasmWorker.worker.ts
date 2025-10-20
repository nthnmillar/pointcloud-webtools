// Web Worker for Rust WASM processing tools - Classic Worker
let wasmModule: any = null;

// Simple logging function for worker context
const WorkerLog = {
  info: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[RustWasmWorker] ${message}`, data || '');
    }
  },
  error: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[RustWasmWorker] ${message}`, data || '');
    }
  }
};

// Initialize Rust WASM module
async function initialize() {
  try {
    WorkerLog.info('Starting Rust WASM initialization...');
    
    // Load WASM JS code using fetch
    const response = await fetch('/wasm/rust/tools_rust.js');
    if (!response.ok) {
      throw new Error(`Failed to fetch Rust WASM JS: ${response.status} ${response.statusText}`);
    }
    
    const jsCode = await response.text();
    WorkerLog.info('Rust WASM JS code loaded', { length: jsCode.length });

    // Create a data URL for the module and import it
    const blob = new Blob([jsCode], { type: 'application/javascript' });
    const moduleUrl = URL.createObjectURL(blob);
    
    WorkerLog.info('Created module URL:', moduleUrl);
    
    const module = await import(/* @vite-ignore */ moduleUrl);
    WorkerLog.info('Module imported successfully');
    WorkerLog.info('Module exports:', Object.keys(module));
    
    // Clean up the URL
    URL.revokeObjectURL(moduleUrl);

    // Get the init function and PointCloudToolsRust class
    const init = module.default;
    
    WorkerLog.info('Init function:', typeof init);
    
    // Initialize the WASM module
    await init('/wasm/rust/tools_rust_bg.wasm');
    
    WorkerLog.info('WASM module initialized, creating PointCloudToolsRust instance...');
    
    // Create the Rust tools instance
    wasmModule = new module.PointCloudToolsRust();
    
    WorkerLog.info('PointCloudToolsRust instance created:', wasmModule);
    
    WorkerLog.info('Rust WASM module initialized successfully');
  } catch (error) {
    WorkerLog.error('Failed to initialize Rust WASM module', error);
    throw error;
  }
}

// Handle voxel downsampling
async function handleVoxelDownsampling(data: any, messageId: number): Promise<void> {
  const startTime = performance.now();
  const result = wasmModule.voxel_downsample(
    new Float64Array(data.pointCloudData),
    data.voxelSize,
    data.globalBounds.minX,
    data.globalBounds.minY,
    data.globalBounds.minZ
  );
  const processingTime = performance.now() - startTime;
  const downsampledPoints = new Float32Array(result);

  const response = {
    type: 'SUCCESS',
    method: 'WASM_RUST',
    messageId,
    data: {
      downsampledPoints,
      originalCount: data.pointCloudData.length / 3,
      downsampledCount: downsampledPoints.length / 3,
      processingTime
    }
  };

  self.postMessage(response, { transfer: [downsampledPoints.buffer] });
}

// Handle point cloud smoothing
async function handlePointCloudSmoothing(data: any, messageId: number): Promise<void> {
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

// Message handler
self.onmessage = async function (e: any) {
  const { type, data, messageId } = e.data;

  WorkerLog.info('Received message:', { type, messageId });

  try {
    switch (type) {
      case 'INITIALIZE':
        WorkerLog.info('INITIALIZE message received');
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
        await handleVoxelDownsampling(data, messageId);
        break;

      case 'POINT_CLOUD_SMOOTHING':
        await handlePointCloudSmoothing(data, messageId);
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    WorkerLog.error('Error handling message:', error);
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

WorkerLog.info('RustWasmWorker Classic Worker loaded');




