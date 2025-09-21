import { Scene, StandardMaterial, Color3, MeshBuilder, Vector3, TransformNode } from '@babylonjs/core';
import { Log } from '../../../utils/Log';

export interface VoxelDownsampleDebugOptions {
  voxelSize: number;
  globalBounds: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  };
  pointClouds?: Array<{
    points: Array<{
      position: { x: number; y: number; z: number };
    }>;
  }>;
  maxVoxels?: number;
  wireframeColor?: { r: number; g: number; b: number };
  alpha?: number;
}

export class VoxelDownsampleDebug {
  private _voxelDebugGroup: TransformNode | null = null;
  private _isVisible = false;
  private _scene: Scene | null = null;
  private _currentPointClouds: any[] = [];
  private _currentGlobalBounds: any = null;
  private _serviceManager: any = null;

  constructor(scene: Scene, serviceManager?: any) {
    this._scene = scene;
    this._serviceManager = serviceManager;
  }

  /**
   * Show voxel debug visualization
   */
  public showVoxelDebug(options: VoxelDownsampleDebugOptions): void {
    if (!this._scene) {
      Log.ErrorClass(this, 'Scene not available for voxel debug');
      return;
    }

    // Hide existing debug first
    this.hideVoxelDebug();

    // Store current data for future updates
    this._currentPointClouds = options.pointClouds || [];
    this._currentGlobalBounds = options.globalBounds;

    // Create voxel wireframes
    this.createVoxelWireframes(options);

    this._isVisible = true;
  }

  /**
   * Hide voxel debug visualization
   */
  public hideVoxelDebug(): void {
    if (this._voxelDebugGroup) {
      this._voxelDebugGroup.dispose();
      this._voxelDebugGroup = null;
      Log.InfoClass(this, 'Voxel debug group removed');
    }
    this._isVisible = false;
  }

  /**
   * Check if voxel debug is currently visible
   */
  public isVisible(): boolean {
    return this._isVisible;
  }

  /**
   * Create voxel wireframe cubes for visualization
   */
  private createVoxelWireframes(options: VoxelDownsampleDebugOptions): void {
    if (!this._scene) {
      Log.ErrorClass(this, 'Scene not available in createVoxelWireframes');
      return;
    }

    const {
      voxelSize,
      globalBounds,
      maxVoxels = 1000,
      wireframeColor = { r: 0, g: 0, b: 1 }, // Blue
      alpha = 0.9
    } = options;

    const { minX, minY, minZ, maxX, maxY, maxZ } = globalBounds;

    // Calculate number of voxels in each dimension
    const numVoxelsX = Math.ceil((maxX - minX) / voxelSize);
    const numVoxelsY = Math.ceil((maxY - minY) / voxelSize);
    const numVoxelsZ = Math.ceil((maxZ - minZ) / voxelSize);


    // Create wireframe material
    const wireframeMaterial = new StandardMaterial('voxelDebugMaterial', this._scene);
    wireframeMaterial.diffuseColor = new Color3(wireframeColor.r, wireframeColor.g, wireframeColor.b);
    wireframeMaterial.emissiveColor = new Color3(wireframeColor.r * 0.5, wireframeColor.g * 0.5, wireframeColor.b * 0.5);
    wireframeMaterial.wireframe = true;
    wireframeMaterial.alpha = alpha;

    // Create parent group for all voxel cubes
    this._voxelDebugGroup = new TransformNode('voxelDebugGroup', this._scene);

    // Find occupied voxels if point clouds are provided
    let occupiedVoxels = new Set<string>();
    if (options.pointClouds) {
      for (const pointCloud of options.pointClouds) {
        if (pointCloud.points) {
          for (const point of pointCloud.points) {
            const voxelX = Math.trunc((point.position.x - minX) / voxelSize);
            const voxelY = Math.trunc((point.position.y - minY) / voxelSize);
            const voxelZ = Math.trunc((point.position.z - minZ) / voxelSize);
            occupiedVoxels.add(`${voxelX},${voxelY},${voxelZ}`);
          }
        }
      }
    }

    let cubeCount = 0;
    const maxCubes = Math.min(maxVoxels, occupiedVoxels.size || numVoxelsX * numVoxelsY * numVoxelsZ);

    if (occupiedVoxels.size > 0) {
      // Show only occupied voxels
      const voxelArray = Array.from(occupiedVoxels);
      const voxelsToShow = voxelArray.slice(0, maxCubes);
      

      for (const voxelKey of voxelsToShow) {
        const [x, y, z] = voxelKey.split(',').map(Number);
        this.createVoxelCube(
          x, y, z,
          minX, minY, minZ,
          maxX, maxY, maxZ,
          voxelSize,
          wireframeMaterial
        );
        cubeCount++;
      }
    } else {
      // Fallback: create a simplified grid for visualization (every 10th voxel)
      const stepX = Math.max(1, Math.floor(numVoxelsX / 10));
      const stepY = Math.max(1, Math.floor(numVoxelsY / 10));
      const stepZ = Math.max(1, Math.floor(numVoxelsZ / 10));

      for (let x = 0; x < numVoxelsX && cubeCount < maxCubes; x += stepX) {
        for (let y = 0; y < numVoxelsY && cubeCount < maxCubes; y += stepY) {
          for (let z = 0; z < numVoxelsZ && cubeCount < maxCubes; z += stepZ) {
            this.createVoxelCube(
              x, y, z,
              minX, minY, minZ,
              maxX, maxY, maxZ,
              voxelSize,
              wireframeMaterial
            );
            cubeCount++;
          }
        }
      }
    }

  }

  /**
   * Create a single voxel cube
   */
  private createVoxelCube(
    voxelX: number, voxelY: number, voxelZ: number,
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
    voxelSize: number,
    material: StandardMaterial
  ): void {
    if (!this._scene || !this._voxelDebugGroup) return;

    // Calculate voxel bounds
    const voxelMinX = minX + voxelX * voxelSize;
    const voxelMinY = minY + voxelY * voxelSize;
    const voxelMinZ = minZ + voxelZ * voxelSize;
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
    const cube = MeshBuilder.CreateBox(`voxel_${voxelX}_${voxelY}_${voxelZ}`, {
      width: sizeX,
      height: sizeY,
      depth: sizeZ
    }, this._scene);

    // Position cube in Babylon.js coordinates
    cube.position = new Vector3(babylonX, babylonY, babylonZ);
    
    // Apply wireframe material
    cube.material = material;
    
    // Add to voxel debug group
    cube.parent = this._voxelDebugGroup;
  }


  /**
   * Update voxel debug with new options
   */
  public updateVoxelDebug(options: VoxelDownsampleDebugOptions): void {
    if (!this._isVisible) {
      // If not visible, do a full recreation
      this.showVoxelDebug(options);
      return;
    }

    // For any changes, recreate to ensure accuracy
    // Voxel size changes require complete recreation anyway
    this.hideVoxelDebug();
    this.showVoxelDebug(options);
  }

  /**
   * Show voxel debug with voxel size (handles data gathering internally)
   */
  public showVoxelDebugWithSize(voxelSize: number): void {
    if (!this._serviceManager?.pointService) {
      Log.ErrorClass(this, 'Point service not available for voxel debug');
      return;
    }

    // Get all point clouds to calculate global bounds
    const allPointCloudIds = this._serviceManager.pointService.pointCloudIds;
    
    if (allPointCloudIds.length === 0) {
      Log.ErrorClass(this, 'No point clouds found for voxel debug');
      return;
    }

    let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
    let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;
    const pointClouds = [];

    for (const pointCloudId of allPointCloudIds) {
      const pointCloud = this._serviceManager.pointService.getPointCloud(pointCloudId);
      if (pointCloud && pointCloud.points) {
        const debugPoints = pointCloud.points.map((p: any) => ({ 
          position: { x: p.position.x, y: p.position.y, z: p.position.z } 
        }));
        pointClouds.push({ points: debugPoints });

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

    const debugOptions: VoxelDownsampleDebugOptions = {
      voxelSize,
      globalBounds: {
        minX: globalMinX,
        minY: globalMinY,
        minZ: globalMinZ,
        maxX: globalMaxX,
        maxY: globalMaxY,
        maxZ: globalMaxZ
      },
      pointClouds
    };

    this.showVoxelDebug(debugOptions);
  }

  /**
   * Update voxel debug with new voxel size (simpler interface)
   */
  public updateVoxelSize(voxelSize: number): void {
    if (!this._isVisible || !this._currentGlobalBounds) {
      return; // Don't update if not visible or no data
    }

    const options: VoxelDownsampleDebugOptions = {
      voxelSize,
      globalBounds: this._currentGlobalBounds,
      pointClouds: this._currentPointClouds
    };

    this.updateVoxelDebug(options);
  }


  /**
   * Dispose of the voxel debug resources
   */
  public dispose(): void {
    this.hideVoxelDebug();
    this._scene = null;
  }
}
