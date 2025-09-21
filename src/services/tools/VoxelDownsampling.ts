import { BaseService } from '../BaseService';
import { ToolsService } from './ToolsService';
import type { ServiceManager } from '../ServiceManager';
import type {
  VoxelModule as VoxelModuleType,
} from '../../wasm/VoxelModule.d.ts';
import { StandardMaterial, Color3, MeshBuilder, Vector3, TransformNode } from '@babylonjs/core';

export interface VoxelDownsampleParams {
  voxelSize: number;
  pointCloudData?: Float32Array;
  globalBounds?: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  };
}

export interface VoxelDownsampleResult {
  success: boolean;
  downsampledPoints?: Float32Array;
  originalCount?: number;
  downsampledCount?: number;
  processingTime?: number;
  error?: string;
}

export class VoxelDownsampling extends BaseService {
  private _isProcessing: boolean = false;
  private _currentVoxelSize: number = 0.1;
  private _toolsService?: ToolsService;
  private _serviceManager?: ServiceManager;
  private _voxelModule?: VoxelModuleType;
  private _voxelDebugId?: string;

  constructor(toolsService?: ToolsService, serviceManager?: ServiceManager) {
    super();
    this._toolsService = toolsService;
    this._serviceManager = serviceManager;
  }

  async initialize(): Promise<void> {
    try {
      // Load WASM module using fetch and eval
      const response = await fetch('/wasm/voxel_downsampling.js');
      const jsCode = await response.text();

      // Create a module function
      const moduleFunction = new Function('module', 'exports', jsCode);

      // Create module object
      const module = { exports: {} };
      moduleFunction(module, module.exports);

      // Get the VoxelModule function
      const VoxelModule = (module.exports as { default?: (options?: { locateFile?: (path: string) => string }) => Promise<VoxelModuleType> }).default || module.exports as (options?: { locateFile?: (path: string) => string }) => Promise<VoxelModuleType>;

      if (typeof VoxelModule !== 'function') {
        throw new Error('VoxelModule is not a function: ' + typeof VoxelModule);
      }

      this._voxelModule = await VoxelModule({
        locateFile: (path: string) => {
          if (path.endsWith('.wasm')) {
            return '/wasm/voxel_downsampling.wasm';
          }
          return path;
        },
      });

      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  // Getters
  get isProcessing(): boolean {
    return this._isProcessing;
  }

  get currentVoxelSize(): number {
    return this._currentVoxelSize;
  }

  // Setters
  setVoxelSize(size: number): void {
    if (size < 0.01 || size > 1.0) {
      throw new Error('Voxel size must be between 0.01 and 1.0 meters');
    }
    this._currentVoxelSize = size;
    this.emit('voxelSizeChanged', { voxelSize: size });
    this._toolsService?.forwardEvent('voxelSizeChanged', { voxelSize: size });
  }

  // WASM Voxel Downsampling
  async voxelDownsampleWasm(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    if (this._isProcessing) {
      throw new Error('Another processing operation is already in progress');
    }

    this._isProcessing = true;
    this.emit('processingStarted', {
      operation: 'voxelDownsampleWasm',
      params,
    });
    this._toolsService?.forwardEvent('processingStarted', {
      operation: 'voxelDownsampleWasm',
      params,
    });

    try {
      const startTime = performance.now();

      // Check if module is loaded, if not try to initialize
      if (!this._voxelModule) {
        await this.initialize();
        if (!this._voxelModule) {
          throw new Error(
            'Failed to load WASM module after initialization attempt'
          );
        }
      }

      if (!params.pointCloudData) {
        throw new Error('No point cloud data provided');
      }


      // Debug: Log the parameters being passed to WASM
      console.log('WASM Input parameters:', {
        pointCount: params.pointCloudData.length / 3,
        voxelSize: params.voxelSize,
        globalBounds: params.globalBounds
      });

      // Ensure we have valid bounds values
      const minX = params.globalBounds?.minX ?? 0;
      const minY = params.globalBounds?.minY ?? 0;
      const minZ = params.globalBounds?.minZ ?? 0;

      // Validate bounds are finite numbers
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(minZ)) {
        console.error('Invalid bounds values:', { minX, minY, minZ });
        throw new Error('Invalid global bounds - non-finite values detected');
      }

      console.log('Using bounds:', { minX, minY, minZ });

      // Pass Float32Array directly like LAZ loader does
      // C++ function only needs min bounds, not max bounds
      const downsampledPoints = this._voxelModule.voxelDownsample(
        params.pointCloudData,
        params.voxelSize,
        minX,
        minY,
        minZ
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


      const result: VoxelDownsampleResult = {
        success: true,
        downsampledPoints: downsampledFloat32,
        originalCount: params.pointCloudData.length / 3,
        downsampledCount: resultLength,
        processingTime,
      };

      this.emit('processingCompleted', {
        operation: 'voxelDownsampleWasm',
        result,
      });
      this._toolsService?.forwardEvent('processingCompleted', {
        operation: 'voxelDownsampleWasm',
        result,
      });
      return result;
    } catch (error) {
      const errorResult: VoxelDownsampleResult = {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };

      this.emit('processingError', {
        operation: 'voxelDownsampleWasm',
        error: errorResult.error,
      });
      this._toolsService?.forwardEvent('processingError', {
        operation: 'voxelDownsampleWasm',
        error: errorResult.error,
      });
      return errorResult;
    } finally {
      this._isProcessing = false;
      this.emit('processingFinished', { operation: 'voxelDownsampleWasm' });
      this._toolsService?.forwardEvent('processingFinished', {
        operation: 'voxelDownsampleWasm',
      });
    }
  }

  // Backend Voxel Downsampling
  async voxelDownsampleBackend(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    if (this._isProcessing) {
      throw new Error('Another processing operation is already in progress');
    }

    this._isProcessing = true;
    this.emit('processingStarted', {
      operation: 'voxelDownsampleBackend',
      params,
    });
    this._toolsService?.forwardEvent('processingStarted', {
      operation: 'voxelDownsampleBackend',
      params,
    });

    try {
      const startTime = performance.now();

      // TODO: Replace with actual backend API call
      // const response = await fetch('/api/voxel-downsample', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     voxelSize: params.voxelSize,
      //     pointCloudData: Array.from(params.pointCloudData || [])
      //   })
      // });
      // const result = await response.json();

      // Simulate processing for now
      await new Promise(resolve => setTimeout(resolve, 1500));

      const processingTime = performance.now() - startTime;

      const result: VoxelDownsampleResult = {
        success: true,
        // downsampledPoints: new Float32Array(result.downsampledPoints),
        originalCount: params.pointCloudData
          ? params.pointCloudData.length / 3
          : 0,
        downsampledCount: params.pointCloudData
          ? Math.floor((params.pointCloudData.length / 3) * 0.25)
          : 0,
        processingTime,
      };

      this.emit('processingCompleted', {
        operation: 'voxelDownsampleBackend',
        result,
      });
      this._toolsService?.forwardEvent('processingCompleted', {
        operation: 'voxelDownsampleBackend',
        result,
      });
      return result;
    } catch (error) {
      const errorResult: VoxelDownsampleResult = {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };

      this.emit('processingError', {
        operation: 'voxelDownsampleBackend',
        error: errorResult.error,
      });
      this._toolsService?.forwardEvent('processingError', {
        operation: 'voxelDownsampleBackend',
        error: errorResult.error,
      });
      return errorResult;
    } finally {
      this._isProcessing = false;
      this.emit('processingFinished', { operation: 'voxelDownsampleBackend' });
      this._toolsService?.forwardEvent('processingFinished', {
        operation: 'voxelDownsampleBackend',
      });
    }
  }

  // Voxel Debug Visualization
  showVoxelDebug(voxelSize: number): void {
    console.log('=== Voxel Debug: Starting ===');
    console.log('Voxel size:', voxelSize);
    
    if (!this._serviceManager?.pointService) {
      console.error('Point service not available for voxel debug');
      return;
    }

    // Clear any existing debug grid
    this.hideVoxelDebug();

    // Get all point clouds to calculate global bounds
    const allPointCloudIds = this._serviceManager.pointService.pointCloudIds;
    console.log('Point cloud IDs:', allPointCloudIds);
    
    if (allPointCloudIds.length === 0) {
      console.error('No point clouds found for voxel debug');
      return;
    }

    let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
    let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

    for (const pointCloudId of allPointCloudIds) {
      const pointCloud = this._serviceManager.pointService.getPointCloud(pointCloudId);
      if (pointCloud && pointCloud.points) {
        for (const point of pointCloud.points) {
          globalMinX = Math.min(globalMinX, point.position.x);
          globalMinY = Math.min(globalMinY, point.position.y);
          globalMinZ = Math.min(globalMinZ, point.position.z);
          globalMaxX = Math.max(globalMaxX, point.position.x);
          globalMaxY = Math.max(globalMaxY, point.position.y);
          globalMaxZ = Math.max(globalMaxZ, point.position.z);
        }
      }
    }

    console.log('Global bounds:', {
      min: [globalMinX, globalMinY, globalMinZ],
      max: [globalMaxX, globalMaxY, globalMaxZ],
      size: [globalMaxX - globalMinX, globalMaxY - globalMinY, globalMaxZ - globalMinZ]
    });

    // Create wireframe lines using Babylon.js directly
    this.createVoxelWireframe(
      globalMinX, globalMinY, globalMinZ,
      globalMaxX, globalMaxY, globalMaxZ,
      voxelSize
    );
    
    console.log('=== Voxel Debug: Complete ===');
  }

  hideVoxelDebug(): void {
    if (this._voxelDebugId && this._serviceManager?.pointService) {
      this._serviceManager.pointService.removePointCloud(this._voxelDebugId);
      this._voxelDebugId = undefined;
    }
    
    // Remove voxel debug group and all its children
    if (this._serviceManager?.sceneService?.scene) {
      const scene = this._serviceManager.sceneService.scene;
      const voxelGroup = scene.getTransformNodeByName('voxel_debug_group');
      if (voxelGroup) {
        voxelGroup.dispose();
        console.log('Voxel debug group removed');
      }
    }
  }

  private createVoxelWireframe(
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
    voxelSize: number
  ): void {
    if (!this._serviceManager?.sceneService?.scene) {
      console.error('Scene not available for wireframe creation');
      return;
    }

    const scene = this._serviceManager.sceneService.scene;
    
    // Calculate number of voxels in each dimension
    const numVoxelsX = Math.ceil((maxX - minX) / voxelSize);
    const numVoxelsY = Math.ceil((maxY - minY) / voxelSize);
    const numVoxelsZ = Math.ceil((maxZ - minZ) / voxelSize);

    console.log('Total voxels possible:', numVoxelsX, 'x', numVoxelsY, 'x', numVoxelsZ, '=', numVoxelsX * numVoxelsY * numVoxelsZ);

    // Only show voxels that actually contain points to avoid freezing
    // First, find which voxels have points
    const occupiedVoxels = new Set<string>();
    
    // Get all point clouds to find occupied voxels
    const allPointCloudIds = this._serviceManager?.pointService?.pointCloudIds || [];
    let pointCount = 0;
    for (const pointCloudId of allPointCloudIds) {
      const pointCloud = this._serviceManager?.pointService?.getPointCloud(pointCloudId);
      if (pointCloud && pointCloud.points) {
        for (const point of pointCloud.points) {
          
          const voxelX = Math.floor((point.position.x - minX) / voxelSize);
          const voxelY = Math.floor((point.position.y - minY) / voxelSize);
          const voxelZ = Math.floor((point.position.z - minZ) / voxelSize);
          occupiedVoxels.add(`${voxelX},${voxelY},${voxelZ}`);
          pointCount++;
        }
      }
    }
    
    console.log('Found', occupiedVoxels.size, 'occupied voxels');

    // Limit to maximum 1000 voxels for performance
    const maxVoxels = 1000;
    const voxelArray = Array.from(occupiedVoxels);
    const voxelsToShow = voxelArray.slice(0, maxVoxels);
    
    if (voxelArray.length > maxVoxels) {
      console.log('Limiting to', maxVoxels, 'voxels for performance');
    }

    // Create wireframe material
    const wireframeMaterial = new StandardMaterial('voxelDebugMaterial', scene);
    wireframeMaterial.diffuseColor = new Color3(0, 0, 1); // Blue
    wireframeMaterial.emissiveColor = new Color3(0, 0, 0.5);
    wireframeMaterial.wireframe = true;
    wireframeMaterial.alpha = 0.9;

    // Create voxel cubes only for occupied voxels
    let cubeCount = 0;
    for (const voxelKey of voxelsToShow) {
      const [x, y, z] = voxelKey.split(',').map(Number);
      
      const voxelMinX = minX + x * voxelSize;
      const voxelMinY = minY + y * voxelSize;
      const voxelMinZ = minZ + z * voxelSize;
      const voxelMaxX = Math.min(voxelMinX + voxelSize, maxX);
      const voxelMaxY = Math.min(voxelMinY + voxelSize, maxY);
      const voxelMaxZ = Math.min(voxelMinZ + voxelSize, maxZ);

      // Calculate center and size in robotics coordinates
      const centerX = (voxelMinX + voxelMaxX) / 2;
      const centerY = (voxelMinY + voxelMaxY) / 2;
      const centerZ = (voxelMinZ + voxelMaxZ) / 2;
      const sizeX = voxelMaxX - voxelMinX;
      const sizeY = voxelMaxY - voxelMinY;
      const sizeZ = voxelMaxZ - voxelMinZ;

      // Convert from robotics coordinates (X=forward, Y=left, Z=up) to Babylon.js (X=right, Y=up, Z=forward)
      // Same transformation as in PointMesh.ts
      const babylonX = -centerY; // left -> right
      const babylonY = centerZ;  // up -> up
      const babylonZ = centerX;  // forward -> forward


      // Create cube
      const cube = MeshBuilder.CreateBox(`voxel_${x}_${y}_${z}`, {
        width: sizeX,
        height: sizeY,
        depth: sizeZ
      }, scene);

      // Position cube in Babylon.js coordinates
      cube.position = new Vector3(babylonX, babylonY, babylonZ);
      
      // Apply wireframe material
      cube.material = wireframeMaterial;
      
      // Add to voxel debug group
      cube.parent = this.getOrCreateVoxelDebugGroup(scene);
      
      cubeCount++;
    }

    console.log('Created', cubeCount, 'wireframe voxel cubes');
  }

  private getOrCreateVoxelDebugGroup(scene: any): TransformNode {
    let group = scene.getTransformNodeByName('voxel_debug_group');
    if (!group) {
      group = new TransformNode('voxel_debug_group', scene);
    }
    return group;
  }


  dispose(): void {
    this._isProcessing = false;
    this.hideVoxelDebug();
    this.removeAllObservers();
  }
}
