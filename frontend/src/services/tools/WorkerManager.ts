import { Log } from '../../utils/Log';
import { CppWasmWorker } from './CppWasmWorker';
import { RustWasmWorker } from './RustWasmWorker';

export class WorkerManager {
  private cppWorker: CppWasmWorker | null = null;
  private rustWorker: RustWasmWorker | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    Log.Info('WorkerManager', 'Initializing workers...');

    let cppWorkerSuccess = false;
    let rustWorkerSuccess = false;

    // Initialize C++ WASM worker (independent)
    try {
      Log.Info('WorkerManager', 'Creating C++ WASM worker...');
      this.cppWorker = new CppWasmWorker();
      await this.cppWorker.initialize();
      Log.Info('WorkerManager', 'C++ WASM worker initialized successfully');
      cppWorkerSuccess = true;
    } catch (error) {
      Log.Error('WorkerManager', 'C++ WASM worker failed to initialize', error);
      // Don't dispose, just mark as failed
    }

    // Initialize Rust WASM worker (independent)
    try {
      Log.Info('WorkerManager', 'Creating Rust WASM worker...');
      this.rustWorker = new RustWasmWorker();
      await this.rustWorker.initialize();
      Log.Info('WorkerManager', 'Rust WASM worker initialized successfully');
      rustWorkerSuccess = true;
    } catch (error) {
      Log.Error(
        'WorkerManager',
        'Rust WASM worker failed to initialize',
        error
      );
      // Don't dispose, just mark as failed
    }

    // Check if at least one worker is working
    if (cppWorkerSuccess || rustWorkerSuccess) {
      this.isInitialized = true;
      Log.Info(
        'WorkerManager',
        `Workers initialized successfully (C++: ${cppWorkerSuccess}, Rust: ${rustWorkerSuccess})`
      );
    } else {
      Log.Error('WorkerManager', 'All workers failed to initialize');
      this.cleanup();
      throw new Error('All workers failed to initialize');
    }
  }

  async processVoxelDownsampling(
    method: 'WASM_CPP' | 'WASM_RUST',
    pointCloudData: Float32Array,
    voxelSize: number,
    globalBounds: {
      minX: number;
      minY: number;
      minZ: number;
      maxX: number;
      maxY: number;
      maxZ: number;
    },
    colors?: Float32Array,
    intensities?: Float32Array,
    classifications?: Uint8Array
  ) {
    if (!this.isInitialized) {
      throw new Error('Workers not initialized');
    }

    switch (method) {
      case 'WASM_CPP':
        if (!this.cppWorker) {
          throw new Error('C++ WASM worker not available');
        }
        return await this.cppWorker.processVoxelDownsampling(
          pointCloudData,
          voxelSize,
          globalBounds,
          colors,
          intensities,
          classifications
        );

      case 'WASM_RUST':
        if (!this.rustWorker) {
          throw new Error('Rust WASM worker not available');
        }
        return await this.rustWorker.processVoxelDownsampling(
          pointCloudData,
          voxelSize,
          globalBounds
        );

      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  async processPointCloudSmoothing(
    method: 'WASM_CPP' | 'WASM_RUST',
    pointCloudData: Float32Array,
    smoothingRadius: number,
    iterations: number
  ) {
    if (!this.isInitialized) {
      throw new Error('Workers not initialized');
    }

    switch (method) {
      case 'WASM_CPP':
        if (!this.cppWorker) {
          throw new Error('C++ WASM worker not available');
        }
        return await this.cppWorker.processPointCloudSmoothing(
          pointCloudData,
          smoothingRadius,
          iterations
        );

      case 'WASM_RUST':
        if (!this.rustWorker) {
          throw new Error('Rust WASM worker not available');
        }
        return await this.rustWorker.processPointCloudSmoothing(
          pointCloudData,
          smoothingRadius,
          iterations
        );

      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  async processVoxelDebug(
    method: 'WASM_CPP' | 'WASM_RUST',
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
  ) {
    if (!this.isInitialized) {
      throw new Error('Workers not initialized');
    }

    switch (method) {
      case 'WASM_CPP':
        if (!this.cppWorker) {
          throw new Error('C++ WASM worker not available');
        }
        return await this.cppWorker.processVoxelDebug(
          pointCloudData,
          voxelSize,
          globalBounds
        );

      case 'WASM_RUST':
        if (!this.rustWorker) {
          throw new Error('Rust WASM worker not available');
        }
        return await this.rustWorker.processVoxelDebug(
          pointCloudData,
          voxelSize,
          globalBounds
        );

      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  private cleanup(): void {
    if (this.cppWorker) {
      this.cppWorker.dispose();
      this.cppWorker = null;
    }
    if (this.rustWorker) {
      this.rustWorker.dispose();
      this.rustWorker = null;
    }
    this.isInitialized = false;
  }

  dispose(): void {
    Log.Info('WorkerManager', 'Disposing workers...');
    this.cleanup();
  }

  get isReady(): boolean {
    return this.isInitialized;
  }
}
