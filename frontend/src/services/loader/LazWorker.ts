// Web Worker for LAZ file processing

// Type definitions for external libraries
interface LASZip {
  open(dataPtr: number, byteLength: number): void;
  getCount(): number;
  getPointLength(): number;
  getPoint(pointBufferPtr: number): void;
  delete(): void;
}

interface LazPerfModule {
  LASZip: new () => LASZip;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
}

interface LasHeaderModule {
  readFileObject(options: { input: File }): Promise<LasHeader>;
}

interface LasHeader {
  ScaleFactorX?: number;
  ScaleFactorY?: number;
  ScaleFactorZ?: number;
  OffsetX?: number;
  OffsetY?: number;
  OffsetZ?: number;
  [key: string]: unknown;
}

let lazPerf: LazPerfModule | null = null;
let lasHeader: LasHeaderModule | null = null;
let currentFileBuffer: ArrayBuffer | null = null;
let currentLaszip: LASZip | null = null;
let currentHeader: LasHeader | null = null;
let currentBatchIndex = 0;
let totalBatches = 0;
let batchSize = 500;

// Initialize libraries
async function initialize() {
  const lazPerfModule = await import('laz-perf');
  const createLazPerf = lazPerfModule.createLazPerf;

  const lasHeaderModule = await import('las-header');
  lasHeader = lasHeaderModule.default as LasHeaderModule;

  lazPerf = await createLazPerf({
    locateFile: (path: string) =>
      path.endsWith('.wasm') ? '/wasm/laz-perf.wasm' : path,
  });
}

// Initialize file for processing
async function initializeFile(
  fileBuffer: ArrayBuffer,
  batchSizeParam: number = 500
) {
  try {
    if (!lasHeader) {
      throw new Error('lasHeader not initialized');
    }
    if (!lazPerf) {
      throw new Error('lazPerf not initialized');
    }
    
    // Read header
    currentHeader = await lasHeader.readFileObject({
      input: new File([fileBuffer], 'file.laz'),
    });

    // Setup laz-perf
    currentLaszip = new lazPerf.LASZip();
    const uint8Array = new Uint8Array(fileBuffer);
    const dataPtr = lazPerf._malloc(uint8Array.length);
    lazPerf.HEAPU8.set(uint8Array, dataPtr);

    currentLaszip.open(dataPtr, fileBuffer.byteLength);

    const pointCount = currentLaszip.getCount();
    batchSize = batchSizeParam;
    totalBatches = Math.ceil(pointCount / batchSize);
    currentBatchIndex = 0;
    currentFileBuffer = fileBuffer;

    // Send initialization complete
    self.postMessage({
      type: 'FILE_INITIALIZED',
      data: {
        pointCount: pointCount,
        totalBatches: totalBatches,
        header: currentHeader,
      },
    });
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      data: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

// Process next batch
async function processNextBatch() {
  if (!currentLaszip || currentBatchIndex >= totalBatches) {
    return;
  }

  try {
    const pointCount = currentLaszip.getCount();
    const pointDataRecordLength = currentLaszip.getPointLength();
    const startIndex = currentBatchIndex * batchSize;
    const endIndex = Math.min(startIndex + batchSize, pointCount);
    const batchPointCount = endIndex - startIndex;

    if (!lazPerf) {
      throw new Error('lazPerf not initialized');
    }
    
    // Create batch points array
    const batchPoints = new Float32Array(batchPointCount * 3);
    const pointBufferPtr = lazPerf._malloc(pointDataRecordLength);
    const pointBuffer = new Uint8Array(pointDataRecordLength);

    // Process points in this batch
    for (let i = 0; i < batchPointCount; i++) {
      try {
        // Get the point at the current position (this advances the internal pointer)
        currentLaszip.getPoint(pointBufferPtr);
        pointBuffer.set(
          lazPerf.HEAPU8.subarray(
            pointBufferPtr,
            pointBufferPtr + pointDataRecordLength
          )
        );

        // Extract coordinates - LAS points are stored as integers that need to be scaled
        const x = new DataView(
          pointBuffer.buffer,
          pointBuffer.byteOffset
        ).getInt32(0, true);
        const y = new DataView(
          pointBuffer.buffer,
          pointBuffer.byteOffset
        ).getInt32(4, true);
        const z = new DataView(
          pointBuffer.buffer,
          pointBuffer.byteOffset
        ).getInt32(8, true);

        // Apply scale and offset from header
        if (!currentHeader) {
          throw new Error('Header not initialized');
        }
        const scaledX =
          x * (currentHeader.ScaleFactorX || 1) + (currentHeader.OffsetX || 0);
        const scaledY =
          y * (currentHeader.ScaleFactorY || 1) + (currentHeader.OffsetY || 0);
        const scaledZ =
          z * (currentHeader.ScaleFactorZ || 1) + (currentHeader.OffsetZ || 0);

        // Store in batch array
        batchPoints[i * 3] = scaledX;
        batchPoints[i * 3 + 1] = scaledY;
        batchPoints[i * 3 + 2] = scaledZ;
      } catch {
        // Continue with next point
      }
    }

    // Clean up point buffer
    lazPerf._free(pointBufferPtr);

    // Send batch data
    const batchMessage = {
      type: 'BATCH_COMPLETE',
      data: {
        batchId: `batch_${currentBatchIndex}`,
        points: batchPoints,
        progress: ((currentBatchIndex + 1) / totalBatches) * 100,
        totalBatches: totalBatches,
        header: currentHeader,
      },
    };

    self.postMessage(batchMessage);

    currentBatchIndex++;

    // Check if we're done
    if (currentBatchIndex >= totalBatches) {
      // Cleanup
      currentLaszip.delete();
      if (currentFileBuffer && lazPerf) {
        const uint8Array = new Uint8Array(currentFileBuffer);
        const dataPtr = lazPerf._malloc(uint8Array.length);
        lazPerf._free(dataPtr);
      }

      // Send completion message
      self.postMessage({
        type: 'PROCESSING_COMPLETE',
        data: {
          pointCount: pointCount,
          totalBatches: totalBatches,
          header: currentHeader,
        },
      });
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      data: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

// Message handler
self.onmessage = async function (e: MessageEvent<{ type: string; data?: { fileBuffer?: ArrayBuffer; batchSize?: number } }>) {
  const { type, data } = e.data;

  try {
    switch (type) {
      case 'INIT':
        await initialize();
        self.postMessage({ type: 'INIT_COMPLETE' });
        break;

      case 'INITIALIZE_FILE':
        if (!data?.fileBuffer) {
          throw new Error('fileBuffer is required for INITIALIZE_FILE');
        }
        await initializeFile(data.fileBuffer, data.batchSize || 500);
        break;

      case 'PROCESS_NEXT_BATCH':
        await processNextBatch();
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
