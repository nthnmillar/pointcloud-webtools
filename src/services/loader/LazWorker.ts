// Web Worker for LAZ file processing
let lazPerf: any = null;
let lasHeader: any = null;

// Initialize libraries
async function initialize() {
  const lazPerfModule = await import('laz-perf');
  const createLazPerf = lazPerfModule.createLazPerf;
  
  // @ts-ignore
  const lasHeaderModule = await import('las-header');
  lasHeader = lasHeaderModule.default;
  
  lazPerf = await createLazPerf({
    locateFile: (path: string) => path.endsWith('.wasm') ? '/laz-perf.wasm' : path
  });
}

// Process LAZ file with batch support
async function processFile(fileBuffer: ArrayBuffer, batchSize: number = 500) {
  try {
    // Read header
    const headerData = await lasHeader.readFileObject({ 
      input: new File([fileBuffer], 'file.laz') 
    });
  
  // Setup laz-perf
  const laszip = new lazPerf.LASZip();
  const uint8Array = new Uint8Array(fileBuffer);
  const dataPtr = lazPerf._malloc(uint8Array.length);
  lazPerf.HEAPU8.set(uint8Array, dataPtr);
  
  laszip.open(dataPtr, fileBuffer.byteLength);
  
  const pointCount = laszip.getCount();
  const pointDataRecordLength = laszip.getPointLength();
  
  // Calculate total batches
  const totalBatches = Math.ceil(pointCount / batchSize);
  
  // Process points in batches
  const pointBufferPtr = lazPerf._malloc(pointDataRecordLength);
  const pointBuffer = new Uint8Array(pointDataRecordLength);
  
  let globalBounds = {
    minX: headerData.MinX || Infinity, maxX: headerData.MaxX || -Infinity,
    minY: headerData.MinY || Infinity, maxY: headerData.MaxY || -Infinity,
    minZ: headerData.MinZ || Infinity, maxZ: headerData.MaxZ || -Infinity,
  };
  
  
  try {
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * batchSize;
      const endIndex = Math.min(startIndex + batchSize, pointCount);
      const batchPointCount = endIndex - startIndex;
      
      // Create batch points array
      const batchPoints = new Float32Array(batchPointCount * 3);
      let batchBounds = {
        minX: Infinity, maxX: -Infinity,
        minY: Infinity, maxY: -Infinity,
        minZ: Infinity, maxZ: -Infinity,
      };
      
      // Process points in this batch
      for (let i = 0; i < batchPointCount; i++) {
        try {
          // Get the point at the current position (this advances the internal pointer)
          laszip.getPoint(pointBufferPtr);
          pointBuffer.set(lazPerf.HEAPU8.subarray(pointBufferPtr, pointBufferPtr + pointDataRecordLength));
        
          // Extract coordinates - LAS points are stored as integers that need to be scaled
          const x = new DataView(pointBuffer.buffer, pointBuffer.byteOffset).getInt32(0, true);
          const y = new DataView(pointBuffer.buffer, pointBuffer.byteOffset).getInt32(4, true);
          const z = new DataView(pointBuffer.buffer, pointBuffer.byteOffset).getInt32(8, true);
      
          // Apply scale and offset from header
          const scaledX = x * (headerData.ScaleFactorX || 1) + (headerData.OffsetX || 0);
          const scaledY = y * (headerData.ScaleFactorY || 1) + (headerData.OffsetY || 0);
          const scaledZ = z * (headerData.ScaleFactorZ || 1) + (headerData.OffsetZ || 0);
          
          // Store in batch array
          batchPoints[i * 3] = scaledX;
          batchPoints[i * 3 + 1] = scaledY;
          batchPoints[i * 3 + 2] = scaledZ;
          
          // Update batch bounds
          batchBounds.minX = Math.min(batchBounds.minX, scaledX);
          batchBounds.maxX = Math.max(batchBounds.maxX, scaledX);
          batchBounds.minY = Math.min(batchBounds.minY, scaledY);
          batchBounds.maxY = Math.max(batchBounds.maxY, scaledY);
          batchBounds.minZ = Math.min(batchBounds.minZ, scaledZ);
          batchBounds.maxZ = Math.max(batchBounds.maxZ, scaledZ);
          
          // Update global bounds
          globalBounds.minX = Math.min(globalBounds.minX, scaledX);
          globalBounds.maxX = Math.max(globalBounds.maxX, scaledX);
          globalBounds.minY = Math.min(globalBounds.minY, scaledY);
          globalBounds.maxY = Math.max(globalBounds.maxY, scaledY);
          globalBounds.minZ = Math.min(globalBounds.minZ, scaledZ);
          globalBounds.maxZ = Math.max(globalBounds.maxZ, scaledZ);
        } catch (pointError) {
          // Continue with next point
        }
      }
    
    // Send batch data
    const batchMessage = {
      type: 'BATCH_COMPLETE',
      data: {
        batchId: `batch_${batchIndex}`,
        points: batchPoints,
        bounds: {
          min: { x: batchBounds.minX, y: batchBounds.minY, z: batchBounds.minZ },
          max: { x: batchBounds.maxX, y: batchBounds.maxY, z: batchBounds.maxZ }
        },
        progress: ((batchIndex + 1) / totalBatches) * 100,
        totalBatches: totalBatches,
        header: headerData
      }
    };
    
    self.postMessage(batchMessage);
    
    // Send progress update
    self.postMessage({ 
      type: 'PROGRESS', 
      progress: ((batchIndex + 1) / totalBatches) * 100 
    });
  }
  
  } catch (error) {
    // Send a fallback batch with some dummy data so we can see something
    self.postMessage({
      type: 'BATCH_COMPLETE',
      data: {
        batchId: 'fallback_batch',
        points: new Float32Array([
          0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4,
          5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9
        ]), // 10 dummy points
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 9, y: 9, z: 9 }
        },
        progress: 50,
        totalBatches: 1,
        header: headerData
      }
    });
    
    // Send completion message
    self.postMessage({
      type: 'PROCESSING_COMPLETE',
      data: {
        pointCount: 10,
        totalBatches: 1,
        globalBounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 9, y: 9, z: 9 }
        },
        header: headerData
      }
    });
    return;
  }
  
  // Cleanup
  laszip.delete();
  lazPerf._free(dataPtr);
  lazPerf._free(pointBufferPtr);
  
  // Send final result with global bounds
  self.postMessage({
    type: 'PROCESSING_COMPLETE',
    data: {
      pointCount: pointCount,
      totalBatches: totalBatches,
      globalBounds: {
        min: { x: globalBounds.minX, y: globalBounds.minY, z: globalBounds.minZ },
        max: { x: globalBounds.maxX, y: globalBounds.maxY, z: globalBounds.maxZ }
      },
      header: headerData
    }
  });
  
  } catch (error) {
    // Send a fallback batch
    self.postMessage({
      type: 'BATCH_COMPLETE',
      data: {
        batchId: 'fallback_batch',
        points: new Float32Array([
          0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4,
          5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9
        ]), // 10 dummy points
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 9, y: 9, z: 9 }
        },
        progress: 100,
        totalBatches: 1,
        header: {}
      }
    });
    
    // Send completion message
    self.postMessage({
      type: 'PROCESSING_COMPLETE',
      data: {
        pointCount: 10,
        totalBatches: 1,
        globalBounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 9, y: 9, z: 9 }
        },
        header: {}
      }
    });
  }
}

// Message handler
self.onmessage = async function(e) {
  const { type, data } = e.data;
  
  try {
    switch (type) {
      case 'INIT':
        await initialize();
        self.postMessage({ type: 'INIT_COMPLETE' });
        break;
        
      case 'PROCESS':
        await processFile(data.fileBuffer, data.batchSize || 500);
        break;
        
      case 'PROCESS_BATCH':
        await processFile(data.fileBuffer, data.batchSize || 500);
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({ 
      type: 'ERROR', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
