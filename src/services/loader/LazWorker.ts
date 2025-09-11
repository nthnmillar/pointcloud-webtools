// Web Worker for LAZ file processing
console.log('LazWorker: Starting');

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
  
  console.log('LazWorker: Initialized');
}

// Process LAZ file
async function processFile(fileBuffer: ArrayBuffer) {
  console.log('LazWorker: Processing file');
  
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
  
  console.log(`LazWorker: Processing ${pointCount} points`);
  
  // Process all points
  const points = new Float32Array(pointCount * 3);
  const pointBufferPtr = lazPerf._malloc(pointDataRecordLength);
  const pointBuffer = new Uint8Array(pointDataRecordLength);
  
  let bounds = {
    minX: headerData.MinX || Infinity, maxX: headerData.MaxX || -Infinity,
    minY: headerData.MinY || Infinity, maxY: headerData.MaxY || -Infinity,
    minZ: headerData.MinZ || Infinity, maxZ: headerData.MaxZ || -Infinity,
  };
  
  for (let i = 0; i < pointCount; i++) {
    laszip.getPoint(pointBufferPtr);
    pointBuffer.set(lazPerf.HEAPU8.subarray(pointBufferPtr, pointBufferPtr + pointDataRecordLength));
    
    // Extract coordinates - LAS points are stored as integers that need to be scaled
    let x, y, z;
    
    // Read as 32-bit signed integers (little-endian)
    x = new DataView(pointBuffer.buffer, pointBuffer.byteOffset).getInt32(0, true);
    y = new DataView(pointBuffer.buffer, pointBuffer.byteOffset).getInt32(4, true);
    z = new DataView(pointBuffer.buffer, pointBuffer.byteOffset).getInt32(8, true);
    
    // Apply scale and offset from header
    const scaledX = x * (headerData.ScaleFactorX || 1) + (headerData.OffsetX || 0);
    const scaledY = y * (headerData.ScaleFactorY || 1) + (headerData.OffsetY || 0);
    const scaledZ = z * (headerData.ScaleFactorZ || 1) + (headerData.OffsetZ || 0);
    
    // Debug first few points
    if (i < 5) {
      console.log(`LazWorker: Point ${i}: raw(${x}, ${y}, ${z}) -> scaled(${scaledX}, ${scaledY}, ${scaledZ})`);
      console.log(`LazWorker: Point buffer length: ${pointBuffer.length}, first 16 bytes:`, Array.from(pointBuffer.slice(0, 16)));
    }
    
    points[i * 3] = scaledX;
    points[i * 3 + 1] = scaledY;
    points[i * 3 + 2] = scaledZ;
    
    bounds.minX = Math.min(bounds.minX, scaledX);
    bounds.maxX = Math.max(bounds.maxX, scaledX);
    bounds.minY = Math.min(bounds.minY, scaledY);
    bounds.maxY = Math.max(bounds.maxY, scaledY);
    bounds.minZ = Math.min(bounds.minZ, scaledZ);
    bounds.maxZ = Math.max(bounds.maxZ, scaledZ);
    
    if (i % 10000 === 0) {
      self.postMessage({ type: 'PROGRESS', progress: (i / pointCount) * 100 });
    }
  }
  
  // Cleanup
  laszip.delete();
  lazPerf._free(dataPtr);
  lazPerf._free(pointBufferPtr);
  
  // Send result
  self.postMessage({
    type: 'RESULT',
    data: {
      points: points,
      pointCount: pointCount,
      bounds: {
        min: { x: bounds.minX, y: bounds.minY, z: bounds.minZ },
        max: { x: bounds.maxX, y: bounds.maxY, z: bounds.maxZ }
      },
      header: headerData
    }
  });
  
  console.log('LazWorker: Complete');
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
        await processFile(data.fileBuffer);
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error('LazWorker: Error:', error);
    self.postMessage({ 
      type: 'ERROR', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
