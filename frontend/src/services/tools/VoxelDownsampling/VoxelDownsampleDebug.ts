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

    const { voxelSize, globalBounds } = options;
    const { minX, minY, minZ, maxX, maxY, maxZ } = globalBounds;

    // Create transform node for grouping voxels if it doesn't exist
    if (!this._voxelDebugGroup) {
      this._voxelDebugGroup = new TransformNode('voxelDebugGroup', this._scene);
    }

    try {
      // Create material for voxel wireframes
      const wireframeMaterial = new StandardMaterial('voxelWireframeMaterial', this._scene);
      wireframeMaterial.wireframe = true;
      wireframeMaterial.alpha = options.alpha ?? 0.8;  // Less transparent for darker appearance
      wireframeMaterial.diffuseColor = new Color3(0.0, 0.08, 0.5);   // Slightly lighter saturated blue
      wireframeMaterial.emissiveColor = new Color3(0.0, 0.08, 0.5);  // Same slightly lighter saturated blue for flat appearance
      wireframeMaterial.specularColor = new Color3(0, 0, 0);        // No specular highlights
      wireframeMaterial.ambientColor = new Color3(0.0, 0.08, 0.5);   // Same slightly lighter saturated blue for flat appearance
      wireframeMaterial.backFaceCulling = false;  // Show all faces

      // Process points and create voxel map with instancing
      const voxelMap = new Map<string, Vector3>();
      const MAX_VOXELS = options.maxVoxels || 2000; // Reduced limit for fewer voxels like before
      
      // First pass: collect all voxel positions
      for (const cloud of this._currentPointClouds) {
        for (const point of cloud.points) {
          const px = point.position.x;
          const py = point.position.y;
          const pz = point.position.z;

          // Skip points outside bounds
          if (px < minX || px > maxX || py < minY || py > maxY || pz < minZ || pz > maxZ) {
            continue;
          }

          // Calculate voxel indices
          const voxelX = Math.floor((px - minX) / voxelSize);
          const voxelY = Math.floor((py - minY) / voxelSize);
          const voxelZ = Math.floor((pz - minZ) / voxelSize);
          
          const key = `${voxelX},${voxelY},${voxelZ}`;
          
          if (!voxelMap.has(key)) {
            // Calculate voxel center
            const centerX = minX + (voxelX + 0.5) * voxelSize;
            const centerY = minY + (voxelY + 0.5) * voxelSize;
            const centerZ = minZ + (voxelZ + 0.5) * voxelSize;

            // Convert to Babylon coordinates
            const babylonX = -centerY;
            const babylonY = centerZ;
            const babylonZ = centerX;

            voxelMap.set(key, new Vector3(babylonX, babylonY, babylonZ));

            // Stop if we hit the voxel limit
            if (voxelMap.size >= MAX_VOXELS) {
              Log.WarnClass(this, `Voxel limit (${MAX_VOXELS}) reached, some voxels will not be shown`);
              break;
            }
          }
        }
        if (voxelMap.size >= MAX_VOXELS) break;
      }

      // Create a single box to be instanced
      const baseBox = MeshBuilder.CreateBox('voxelTemplate', {
        size: voxelSize,
        updatable: false
      }, this._scene);
      baseBox.material = wireframeMaterial;
      baseBox.isVisible = false;

      // Create instances for each voxel position
      const positions = Array.from(voxelMap.values());
      const instances = positions.map((pos, idx) => {
        const instance = baseBox.createInstance(`voxel_${idx}`);
        instance.position = pos;
        instance.parent = this._voxelDebugGroup;
        return instance;
      });

      Log.InfoClass(this, `Created ${voxelMap.size} voxel debug wireframes`);
    } catch (error) {
      Log.ErrorClass(this, 'Error creating voxel wireframes:', error);
    }
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
}
