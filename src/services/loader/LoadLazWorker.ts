// Import laz-perf dynamically to avoid WASM loading issues during module initialization
let createLazPerf: any = null;
let lasHeader: any = null;

/**
 * Worker class for processing LAZ files using laz-perf
 * Handles the heavy lifting of decompressing LAZ data in a web worker
 */
export class LoadLazWorker {
  private lazPerf: any = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Don't initialize immediately, wait until first use
  }

  /**
   * Initialize the laz-perf library
   */
  private async initializeLazPerf(): Promise<void> {
    try {
      console.log('Initializing laz-perf...');
      
      // Dynamically import laz-perf to avoid WASM loading issues
      if (!createLazPerf) {
        const lazPerfModule = await import('laz-perf');
        createLazPerf = lazPerfModule.createLazPerf;
      }
      
      // Dynamically import las-header for reading LAS/LAZ headers
      if (!lasHeader) {
        // @ts-ignore - las-header doesn't have type definitions
        const lasHeaderModule = await import('las-header');
        lasHeader = lasHeaderModule.default;
      }
      
      // Configure laz-perf to use the WASM file from public directory
      const moduleConfig = {
        locateFile: (path: string) => {
          if (path.endsWith('.wasm')) {
            return '/laz-perf.wasm';
          }
          return path;
        }
      };
      
      this.lazPerf = await createLazPerf(moduleConfig);
      console.log('laz-perf initialized successfully');
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize laz-perf:', error);
      console.error('Error details:', error);
      throw new Error('Failed to initialize LAZ processing library');
    }
  }

  /**
   * Wait for the worker to be initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized && !this.initPromise) {
      this.initPromise = this.initializeLazPerf();
    }
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Process a LAZ file and extract point data
   * @param fileBuffer - The LAZ file as an ArrayBuffer
   * @param onProgress - Optional callback for progress updates
   * @returns Promise with processed point data
   */
  async processLazFile(
    fileBuffer: ArrayBuffer, 
    onProgress?: (progress: number) => void
  ): Promise<{
    points: Float32Array;
    pointCount: number;
    bounds: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      minZ: number;
      maxZ: number;
    };
    header: any;
  }> {
    await this.ensureInitialized();

    let dataPtr: number | undefined;
    let pointBufferPtr: number | undefined;
    
    try {
      // First, read the LAS/LAZ header using las-header
      console.log('Reading LAS/LAZ header...');
      const headerData = await lasHeader.readFileObject({ input: new File([fileBuffer], 'file.laz') });
      console.log('Header data:', headerData);
      
      // Create a file reader for the LAZ data
      const laszip = new this.lazPerf.LASZip();
      
      // Convert ArrayBuffer to Uint8Array for laz-perf
      const uint8Array = new Uint8Array(fileBuffer);
      
      // Open the LAZ file - laz-perf expects the data to be in the Emscripten heap
      // We need to allocate memory in the WASM heap and copy the data there
      dataPtr = this.lazPerf._malloc(uint8Array.length);
      this.lazPerf.HEAPU8.set(uint8Array, dataPtr);
      
      laszip.open(dataPtr, fileBuffer.byteLength);
      
      // Get point information using laz-perf API
      const pointCount = laszip.getCount();
      const pointDataRecordLength = laszip.getPointLength();
      const pointDataRecordFormat = laszip.getPointFormat();
      
      console.log(`Processing LAZ file: ${pointCount} points, format ${pointDataRecordFormat}`);
      
      // Prepare arrays for point data
      const points = new Float32Array(pointCount * 3); // x, y, z coordinates
      
      // Allocate memory for point buffer in WASM heap
      pointBufferPtr = this.lazPerf._malloc(pointDataRecordLength);
      const pointBuffer = new Uint8Array(pointDataRecordLength);
      
      // Use bounds from header data if available, otherwise calculate them
      let bounds = {
        minX: headerData.MinX || Infinity,
        maxX: headerData.MaxX || -Infinity,
        minY: headerData.MinY || Infinity,
        maxY: headerData.MaxY || -Infinity,
        minZ: headerData.MinZ || Infinity,
        maxZ: headerData.MaxZ || -Infinity
      };
      
      // Process each point
      for (let i = 0; i < pointCount; i++) {
        // Get point data - pass the pointer to the allocated memory
        laszip.getPoint(pointBufferPtr);
        
        // Copy data from WASM heap to JavaScript buffer
        pointBuffer.set(this.lazPerf.HEAPU8.subarray(pointBufferPtr, pointBufferPtr + pointDataRecordLength));
        
        // Extract coordinates using header scale factors and offsets
        const coords = this.extractCoordinates(pointBuffer, pointDataRecordFormat, headerData);
        
        // Store in points array
        const pointIndex = i * 3;
        points[pointIndex] = coords.x;
        points[pointIndex + 1] = coords.y;
        points[pointIndex + 2] = coords.z;
        
        // Update bounds if not provided in header
        if (headerData.MinX === undefined) {
          bounds.minX = Math.min(bounds.minX, coords.x);
          bounds.maxX = Math.max(bounds.maxX, coords.x);
          bounds.minY = Math.min(bounds.minY, coords.y);
          bounds.maxY = Math.max(bounds.maxY, coords.y);
          bounds.minZ = Math.min(bounds.minZ, coords.z);
          bounds.maxZ = Math.max(bounds.maxZ, coords.z);
        }
        
        // Report progress
        if (onProgress && i % 1000 === 0) {
          onProgress((i / pointCount) * 100);
        }
      }
      
      // Clean up
      laszip.delete();
      if (dataPtr !== undefined) {
        this.lazPerf._free(dataPtr);
      }
      if (pointBufferPtr !== undefined) {
        this.lazPerf._free(pointBufferPtr);
      }
      
      // Final progress update
      if (onProgress) {
        onProgress(100);
      }
      
      console.log('LAZ processing completed:', {
        pointCount,
        bounds,
        pointsLength: points.length,
        firstPoint: points.length > 0 ? { x: points[0], y: points[1], z: points[2] } : null
      });
      
      return {
        points,
        pointCount,
        bounds,
        header: {
          pointCount,
          pointDataRecordFormat,
          pointDataRecordLength,
          scaleX: headerData.ScaleFactorX,
          scaleY: headerData.ScaleFactorY,
          scaleZ: headerData.ScaleFactorZ,
          offsetX: headerData.OffsetX,
          offsetY: headerData.OffsetY,
          offsetZ: headerData.OffsetZ,
          // Include additional header information
          fileSignature: headerData.FileSignature,
          versionMajor: headerData.VersionMajor,
          versionMinor: headerData.VersionMinor,
          systemIdentifier: headerData.SystemIdentifier,
          generatingSoftware: headerData.GeneratingSoftware,
          creationDay: headerData.CreationDay,
          creationYear: headerData.CreationYear,
          epsg: headerData.epsg
        }
      };
      
    } catch (error) {
      console.error('Error processing LAZ file:', error);
      // Clean up allocated memory in case of error
      if (dataPtr !== undefined) {
        this.lazPerf._free(dataPtr);
      }
      if (pointBufferPtr !== undefined) {
        this.lazPerf._free(pointBufferPtr);
      }
      throw new Error(`Failed to process LAZ file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract coordinates from point data based on LAS point format
   * @param pointBuffer - Raw point data
   * @param format - LAS point data record format
   * @param headerData - LAS header information from las-header
   * @returns Object with x, y, z coordinates
   */
  private extractCoordinates(
    pointBuffer: Uint8Array, 
    _format: number, 
    headerData: any
  ): { x: number; y: number; z: number } {
    const view = new DataView(pointBuffer.buffer, pointBuffer.byteOffset);
    
    // Read raw coordinates (always at the beginning of the point record)
    const rawX = view.getInt32(0, true); // little-endian
    const rawY = view.getInt32(4, true);
    const rawZ = view.getInt32(8, true);
    
    // Convert to real coordinates using scale and offset from header
    const x = rawX * headerData.ScaleFactorX + headerData.OffsetX;
    const y = rawY * headerData.ScaleFactorY + headerData.OffsetY;
    const z = rawZ * headerData.ScaleFactorZ + headerData.OffsetZ;
    
    // Debug first few points
    if (Math.random() < 0.001) { // Log ~0.1% of points to avoid spam
      console.log('Point coordinates:', {
        raw: { x: rawX, y: rawY, z: rawZ },
        scaled: { x, y, z },
        scale: { x: headerData.ScaleFactorX, y: headerData.ScaleFactorY, z: headerData.ScaleFactorZ },
        offset: { x: headerData.OffsetX, y: headerData.OffsetY, z: headerData.OffsetZ }
      });
    }
    
    return { x, y, z };
  }

  /**
   * Check if the worker is ready
   */
  get ready(): boolean {
    return this.isInitialized;
  }

  /**
   * Dispose of the worker and clean up resources
   */
  dispose(): void {
    this.lazPerf = null;
    this.isInitialized = false;
  }
}
