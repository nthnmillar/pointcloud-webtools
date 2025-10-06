// Unified Tools Worker
// Handles both voxel downsampling and point cloud smoothing in a separate thread

import { Log } from '../../utils/Log';

// Worker message types
interface WorkerMessage {
  type: 'VOXEL_DOWNSAMPLE' | 'POINT_CLOUD_SMOOTHING';
  data: {
    pointCloudData: Float32Array;
    voxelSize?: number;
    globalBounds?: {
      minX: number;
      minY: number;
      minZ: number;
      maxX: number;
      maxY: number;
      maxZ: number;
    };
    smoothingRadius?: number;
    iterations?: number;
  };
}

interface WorkerResponse {
  type: 'VOXEL_DOWNSAMPLE_SUCCESS' | 'VOXEL_DOWNSAMPLE_ERROR' | 'POINT_CLOUD_SMOOTHING_SUCCESS' | 'POINT_CLOUD_SMOOTHING_ERROR';
  data?: {
    downsampledPoints?: Float32Array;
    smoothedPoints?: Float32Array;
    originalCount: number;
    downsampledCount?: number;
    smoothedCount?: number;
    processingTime: number;
    voxelCount?: number;
  };
  error?: string;
}

// Load WASM module
let toolsModule: any = null;

async function loadWasmModule() {
  if (toolsModule) return toolsModule;
  
  try {
    Log.Info('ToolsWorker', 'Loading WASM module...');
    
    // Load the WASM module from public directory
    const response = await fetch('/wasm/cpp/tools_cpp.js');
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM JS: ${response.status} ${response.statusText}`);
    }
    
    const jsCode = await response.text();
    Log.Info('ToolsWorker', 'WASM JS code loaded', { length: jsCode.length });

    // Create a module function
    const moduleFunction = new Function('module', 'exports', jsCode);

    // Create module object
    const module = { exports: {} };
    moduleFunction(module, module.exports);

    // Get the ToolsModule function
    const ToolsModuleFactory = (module.exports as { default?: (options?: { locateFile?: (path: string) => string }) => Promise<any> }).default || module.exports as (options?: { locateFile?: (path: string) => string }) => Promise<any>;

    if (typeof ToolsModuleFactory !== 'function') {
      throw new Error('ToolsModuleFactory is not a function: ' + typeof ToolsModuleFactory);
    }

    Log.Info('ToolsWorker', 'ToolsModuleFactory function obtained');
    
    toolsModule = await ToolsModuleFactory({
      locateFile: (path: string) => {
        Log.Info('ToolsWorker', 'locateFile called with path', { path });
        if (path.endsWith('.wasm')) {
          const wasmUrl = new URL('/wasm/cpp/tools_cpp.wasm', window.location.origin).href;
          Log.Info('ToolsWorker', 'Resolved WASM URL', { wasmUrl });
          return wasmUrl;
        }
        return path;
      },
    });
    
    Log.Info('ToolsWorker', 'WASM module loaded successfully');
    return toolsModule;
  } catch (error) {
    Log.Error('ToolsWorker', 'Failed to load WASM module', error);
    return null;
  }
}

// Voxel downsampling function (TypeScript fallback)
function voxelDownsampleTS(
  pointCloudData: Float32Array,
  voxelSize: number,
  globalBounds: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  }
): {
  downsampledPoints: Float32Array;
  originalCount: number;
  downsampledCount: number;
  processingTime: number;
  voxelCount: number;
} {
  const startTime = performance.now();
  
  const pointCount = pointCloudData.length / 3;
  const voxelMap = new Map<string, {
    count: number;
    sumX: number;
    sumY: number;
    sumZ: number;
  }>();
  
  // Process each point
  for (let i = 0; i < pointCount; i++) {
    const x = pointCloudData[i * 3];
    const y = pointCloudData[i * 3 + 1];
    const z = pointCloudData[i * 3 + 2];
    
    // Calculate voxel coordinates
    const voxelX = Math.floor((x - globalBounds.minX) / voxelSize);
    const voxelY = Math.floor((y - globalBounds.minY) / voxelSize);
    const voxelZ = Math.floor((z - globalBounds.minZ) / voxelSize);
    
    const voxelKey = `${voxelX},${voxelY},${voxelZ}`;
    
    if (voxelMap.has(voxelKey)) {
      const voxel = voxelMap.get(voxelKey)!;
      voxel.count++;
      voxel.sumX += x;
      voxel.sumY += y;
      voxel.sumZ += z;
    } else {
      voxelMap.set(voxelKey, {
        count: 1,
        sumX: x,
        sumY: y,
        sumZ: z
      });
    }
  }
  
  // Create downsampled points
  const downsampledPoints: number[] = [];
  for (const [_, voxel] of voxelMap) {
    downsampledPoints.push(
      voxel.sumX / voxel.count,
      voxel.sumY / voxel.count,
      voxel.sumZ / voxel.count
    );
  }
  
  const processingTime = performance.now() - startTime;
  
  return {
    downsampledPoints: new Float32Array(downsampledPoints),
    originalCount: pointCount,
    downsampledCount: downsampledPoints.length / 3,
    processingTime,
    voxelCount: voxelMap.size
  };
}


// Handle worker messages
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, data } = event.data;
  
  try {
    if (type === 'VOXEL_DOWNSAMPLE') {
      Log.Info('ToolsWorker', 'Starting voxel downsampling...');
      
      let result;
      
      try {
        // Use WASM only
        const module = await loadWasmModule();
        
        if (module && module.voxelDownsample && data.globalBounds && data.voxelSize) {
          Log.Info('ToolsWorker', 'Using WASM implementation');
          result = module.voxelDownsample(
            data.pointCloudData,
            data.voxelSize,
            data.globalBounds.minX,
            data.globalBounds.minY,
            data.globalBounds.minZ
          );
        } else {
          throw new Error('WASM function not available');
        }
      } catch (wasmError) {
        Log.Error('ToolsWorker', 'WASM failed', wasmError);
        throw wasmError;
      }
      
      const response: WorkerResponse = {
        type: 'VOXEL_DOWNSAMPLE_SUCCESS',
        data: {
          downsampledPoints: result.downsampledPoints || result,
          originalCount: result.originalCount || data.pointCloudData.length / 3,
          downsampledCount: result.downsampledCount || result.length / 3,
          processingTime: result.processingTime || 0,
          voxelCount: result.voxelCount || 0
        }
      };
      
      self.postMessage(response);
    } else if (type === 'POINT_CLOUD_SMOOTHING') {
      Log.Info('ToolsWorker', 'Starting point cloud smoothing...');
      
      let result;
      
      try {
        // Use WASM only
        const module = await loadWasmModule();
        
        if (module && module.pointCloudSmoothing && data.smoothingRadius && data.iterations) {
          Log.Info('ToolsWorker', 'Using WASM implementation');
          result = module.pointCloudSmoothing(
            data.pointCloudData,
            data.smoothingRadius,
            data.iterations
          );
        } else {
          throw new Error('WASM function not available');
        }
      } catch (wasmError) {
        Log.Error('ToolsWorker', 'WASM failed', wasmError);
        throw wasmError;
      }
      
      const response: WorkerResponse = {
        type: 'POINT_CLOUD_SMOOTHING_SUCCESS',
        data: {
          smoothedPoints: result.smoothedPoints || result,
          originalCount: result.originalCount || data.pointCloudData.length / 3,
          smoothedCount: result.smoothedCount || result.length / 3,
          processingTime: result.processingTime || 0
        }
      };
      
      self.postMessage(response);
    }
  } catch (error) {
    Log.Error('ToolsWorker', 'Worker error', error);
    
    const response: WorkerResponse = {
      type: type === 'VOXEL_DOWNSAMPLE' ? 'VOXEL_DOWNSAMPLE_ERROR' : 'POINT_CLOUD_SMOOTHING_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    
    self.postMessage(response);
  }
};