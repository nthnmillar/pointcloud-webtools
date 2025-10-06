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

    // Create voxel wireframes
    this.createVoxelWireframes(options);

    this._isVisible = true;
  }

  /**
   * Hide voxel debug visualization
   */
  public hideVoxelDebug(): void {
    if (this._scene) {
      // Remove all voxel-related meshes
      const voxelMeshes = this._scene.meshes.filter(mesh => 
        mesh.name.startsWith('voxelInstance_') || 
        mesh.name === 'voxelTemplate' ||
        mesh.name === 'voxelDebugGroup'
      );
      
      voxelMeshes.forEach(mesh => {
        mesh.dispose();
      });
      
      Log.InfoClass(this, `Removed ${voxelMeshes.length} voxel meshes`);
    }
    
    if (this._voxelDebugGroup) {
      this._voxelDebugGroup.dispose();
      this._voxelDebugGroup = null;
      Log.InfoClass(this, 'Voxel debug group removed');
    }
    this._isVisible = false;
  }

  /**
   * Update voxel size of existing debug visualization
   */
  public updateVoxelSize(newVoxelSize: number): void {
    if (!this._isVisible || !this._scene) {
      Log.InfoClass(this, 'No active debug visualization to update');
      return;
    }

    Log.InfoClass(this, 'Updating voxel size for existing debug visualization', { newVoxelSize });
    
    // Find all voxel instances (including those in debug group)
    const voxelInstances = this._scene.meshes.filter(mesh => 
      mesh.name.startsWith('voxelInstance_')
    );

    Log.InfoClass(this, `Found ${voxelInstances.length} voxel instances to update`);
    
    if (voxelInstances.length > 0) {
      // Update the base template size
      const baseBox = this._scene.getMeshByName('voxelTemplate');
      if (baseBox) {
        baseBox.scaling = new Vector3(newVoxelSize, newVoxelSize, newVoxelSize);
        Log.InfoClass(this, 'Updated base voxel template size', { newVoxelSize });
      }
      
      // Update all instances
      voxelInstances.forEach((instance, index) => {
        instance.scaling = new Vector3(newVoxelSize, newVoxelSize, newVoxelSize);
        if (index < 3) { // Log first 3 for debugging
          Log.InfoClass(this, `Updated instance ${index} scaling`, { scaling: instance.scaling });
        }
      });
      
      Log.InfoClass(this, 'Updated voxel size for all instances');
    } else {
      Log.WarnClass(this, 'No voxel instances found to update');
      // Try to find instances in the debug group
      if (this._voxelDebugGroup) {
        const groupChildren = this._voxelDebugGroup.getChildMeshes();
        Log.InfoClass(this, 'Debug group children', { count: groupChildren.length });
        groupChildren.forEach(child => {
          if (child.name.startsWith('voxelInstance_')) {
            child.scaling = new Vector3(newVoxelSize, newVoxelSize, newVoxelSize);
            Log.InfoClass(this, `Updated child instance ${child.name} scaling`, { scaling: child.scaling });
          }
        });
      }
    }
  }

  /**
   * Check if voxel debug is currently visible
   */
  public isVisible(): boolean {
    return this._isVisible;
  }

  /**
   * Show voxel debug with pre-calculated centers
   */
  public showVoxelDebugWithCenters(voxelCenters: Float32Array, voxelSize: number, color: { r: number; g: number; b: number } = { r: 0/255, g: 100/255, b: 200/255 }, maxVoxels: number = 2000): void {
    Log.InfoClass(this, 'showVoxelDebugWithCenters called', {
      voxelCentersLength: voxelCenters.length,
      voxelSize,
      sceneAvailable: !!this._scene,
      color,
      firstFewCenters: Array.from(voxelCenters.slice(0, 9))
    });

    if (!this._scene) {
      Log.ErrorClass(this, 'Scene not available for voxel debug');
      return;
    }

    // Hide existing debug first
    this.hideVoxelDebug();

    // Create wireframe material with specified color
    const wireframeMaterial = new StandardMaterial('voxelDebugMaterial', this._scene);
    wireframeMaterial.wireframe = true;
    // Make darker and more saturated for better contrast
    const darkerColor = new Color3(color.r * 0.6, color.g * 0.6, color.b * 0.6);
    wireframeMaterial.emissiveColor = darkerColor;
    wireframeMaterial.diffuseColor = darkerColor;
    wireframeMaterial.specularColor = new Color3(0, 0, 0); // No specular highlights for solid appearance
    wireframeMaterial.ambientColor = darkerColor;
    wireframeMaterial.alpha = 1.0; // Fully opaque for solid appearance

    // Create debug group to organize voxel instances
    this._voxelDebugGroup = new TransformNode('voxelDebugGroup', this._scene);
    
    // Create a single box to be instanced (use standard size 1, then scale)
    Log.InfoClass(this, 'Creating base box with voxel size', { voxelSize });
    const baseBox = MeshBuilder.CreateBox('voxelTemplate', {
      size: 1, // Use standard size 1
      updatable: false
    }, this._scene);
    baseBox.material = wireframeMaterial;
    baseBox.isVisible = false;
    baseBox.parent = this._voxelDebugGroup;
    
    // Set the scaling to match the voxel size
    baseBox.scaling = new Vector3(voxelSize, voxelSize, voxelSize);
    Log.InfoClass(this, 'Base box created with scaling', { scaling: baseBox.scaling });

    // Create instances for each voxel center
    const centerCount = voxelCenters.length / 3;
    Log.InfoClass(this, `Creating ${centerCount} voxel instances`);
    
    // Debug: Log first few voxel centers and check for duplicates
    const firstCenters = Array.from({length: Math.min(5, centerCount)}, (_, i) => ({
      x: voxelCenters[i * 3],
      y: voxelCenters[i * 3 + 1], 
      z: voxelCenters[i * 3 + 2]
    }));
    Log.InfoClass(this, 'First 5 voxel centers', { firstCenters });
    
    // Debug: Check if voxel centers are all zeros or invalid
    const hasValidCenters = firstCenters.some(center => 
      center.x !== 0 || center.y !== 0 || center.z !== 0
    );
    if (!hasValidCenters) {
      Log.WarnClass(this, 'All voxel centers appear to be zero or invalid!', {
        voxelCentersLength: voxelCenters.length,
        firstCenters: firstCenters,
        rawVoxelCenters: Array.from(voxelCenters).slice(0, 12)
      });
    }
    
    // Check if all centers are the same (indicates a problem)
    const uniqueCenters = new Set(firstCenters.map(c => `${c.x},${c.y},${c.z}`));
    if (uniqueCenters.size === 1) {
      Log.WarnClass(this, 'All voxel centers are identical! This indicates a problem with voxel generation.');
    }
    
    // Limit the number of voxels to display for performance
    const voxelsToShow = Math.min(centerCount, maxVoxels);
    if (centerCount > maxVoxels) {
      Log.WarnClass(this, `Voxel limit (${maxVoxels}) reached, showing ${voxelsToShow} of ${centerCount} voxels`);
    }

    for (let i = 0; i < voxelsToShow; i++) {
      const x = voxelCenters[i * 3];
      const y = voxelCenters[i * 3 + 1];
      const z = voxelCenters[i * 3 + 2];

      // Convert coordinates from robotics (X=forward, Y=left, Z=up) to Babylon.js (X=right, Y=up, Z=forward)
      // This matches the transformation used in PointMesh.ts
      const babylonX = -y; // left -> right (negated)
      const babylonY = z;  // up -> up
      const babylonZ = x;  // forward -> forward

      const instance = baseBox.createInstance(`voxelInstance_${i}`);
      instance.position = new Vector3(babylonX, babylonY, babylonZ);
      instance.parent = this._voxelDebugGroup;
      
      if (i < 5) { // Log first 5 instances for debugging
        Log.InfoClass(this, `Created voxel instance ${i}`, {
          originalPos: { x, y, z },
          babylonPos: { x: babylonX, y: babylonY, z: babylonZ }
        });
      }
    }

    this._isVisible = true;
    Log.InfoClass(this, `Created ${centerCount} voxel debug instances successfully`);
  }

  /**
   * Get current point clouds for processing
   */
  public getCurrentPointClouds(): Array<{
    points: Array<{
      position: { x: number; y: number; z: number };
    }>;
  }> {
    Log.InfoClass(this, 'getCurrentPointClouds called', {
      currentPointClouds: this._currentPointClouds?.length || 0,
      serviceManager: !!this._serviceManager
    });
    
    // If we have cached point clouds, return them
    if (this._currentPointClouds && this._currentPointClouds.length > 0) {
      Log.InfoClass(this, 'Returning cached point clouds', { count: this._currentPointClouds.length });
      return this._currentPointClouds;
    }
    
    // Try to get point clouds from the service manager
    if (this._serviceManager?.pointService) {
      const pointCloudIds = this._serviceManager.pointService.pointCloudIds || [];
      Log.InfoClass(this, 'Found point cloud IDs', { pointCloudIds });
      
      const pointClouds = [];
      for (const id of pointCloudIds) {
        const pointCloud = this._serviceManager.pointService.getPointCloud(id);
        if (pointCloud && pointCloud.points) {
          Log.InfoClass(this, 'Found point cloud', { id, pointCount: pointCloud.points.length });
          pointClouds.push(pointCloud);
        }
      }
      
      if (pointClouds.length > 0) {
        Log.InfoClass(this, 'Retrieved point clouds from service manager', { count: pointClouds.length });
        return pointClouds;
      }
    }
    
    Log.WarnClass(this, 'No point clouds found in cache or service manager');
    return [];
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
      // Make darker and more saturated for better contrast
      const darkerColor = new Color3(0.0, 0.05, 0.3); // Darker blue for better contrast
      wireframeMaterial.diffuseColor = darkerColor;
      wireframeMaterial.emissiveColor = darkerColor;
      wireframeMaterial.specularColor = new Color3(0, 0, 0); // No specular highlights for solid appearance
      wireframeMaterial.ambientColor = darkerColor;
      wireframeMaterial.alpha = 1.0; // Fully opaque for solid appearance
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
      positions.forEach((pos, idx) => {
        const instance = baseBox.createInstance(`voxel_${idx}`);
        instance.position = pos;
        instance.parent = this._voxelDebugGroup;
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

}
