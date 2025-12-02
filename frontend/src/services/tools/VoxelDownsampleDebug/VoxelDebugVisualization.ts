import {
  Scene,
  StandardMaterial,
  Color3,
  MeshBuilder,
  Vector3,
  TransformNode,
} from '@babylonjs/core';
import { Log } from '../../../utils/Log';
import type { ServiceManager } from '../../ServiceManager';
import type { PointCloudPoint } from '../../point/PointCloud';

export interface SimplifiedPointCloud {
  points: Array<{
    position: { x: number; y: number; z: number };
  }>;
}

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
  pointClouds?: SimplifiedPointCloud[];
  maxVoxels?: number;
  wireframeColor?: { r: number; g: number; b: number };
  alpha?: number;
}

export class VoxelDebugVisualization {
  private _voxelDebugGroup: TransformNode | null = null;
  private _isVisible = false;
  private _scene: Scene | null = null;
  private _currentPointClouds: SimplifiedPointCloud[] = [];
  private _serviceManager: ServiceManager | null = null;
  private _updateTimeout: NodeJS.Timeout | null = null;
  private _isUpdating = false;
  private _currentImplementation:
    | 'TS'
    | 'WASM'
    | 'WASM_MAIN'
    | 'WASM_RUST'
    | 'RUST_WASM_MAIN'
    | 'BE'
    | 'BE_RUST'
    | 'BE_PYTHON' = 'TS';
  private _currentColor: { r: number; g: number; b: number } = {
    r: 0 / 255,
    g: 100 / 255,
    b: 200 / 255,
  };

  constructor(scene: Scene, serviceManager?: ServiceManager | null) {
    this._scene = scene;
    this._serviceManager = serviceManager || null;
  }

  /**
   * Set the current implementation for voxel debug
   */
  public setImplementation(
    implementation:
      | 'TS'
      | 'WASM'
      | 'WASM_MAIN'
      | 'WASM_RUST'
      | 'RUST_WASM_MAIN'
      | 'BE'
      | 'BE_RUST'
      | 'BE_PYTHON'
  ): void {
    this._currentImplementation = implementation;
    Log.InfoClass(this, 'Voxel debug implementation set', { implementation });
  }

  /**
   * Set the current color for voxel debug
   */
  public setColor(color: { r: number; g: number; b: number }): void {
    this._currentColor = color;
    Log.InfoClass(this, 'Voxel debug color set', { color });
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
    // Clear any pending updates
    if (this._updateTimeout) {
      clearTimeout(this._updateTimeout);
      this._updateTimeout = null;
    }

    if (this._scene) {
      // Remove all voxel-related meshes
      const voxelMeshes = this._scene.meshes.filter(
        mesh =>
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
   * Update voxel size of existing debug visualization with debouncing
   */
  public updateVoxelSize(newVoxelSize: number): void {
    if (!this._isVisible || !this._scene) {
      Log.InfoClass(this, 'No active debug visualization to update');
      return;
    }

    // Clear any existing timeout
    if (this._updateTimeout) {
      clearTimeout(this._updateTimeout);
    }

    // Immediate visual feedback - just update scaling
    this.updateVoxelScaling(newVoxelSize);

    // Debounced full regeneration
    this._updateTimeout = setTimeout(async () => {
      await this.regenerateVoxelDebug(newVoxelSize);
    }, 150); // 150ms delay
  }

  /**
   * Quick visual update - just change scaling of existing boxes
   */
  private updateVoxelScaling(newVoxelSize: number): void {
    if (!this._scene) return;

    // Update base template scaling
    const baseBox = this._scene.getMeshByName('voxelTemplate');
    if (baseBox) {
      baseBox.scaling = new Vector3(newVoxelSize, newVoxelSize, newVoxelSize);
    }

    // Update all instances scaling
    const voxelInstances = this._scene.meshes.filter(mesh =>
      mesh.name.startsWith('voxelInstance_')
    );

    voxelInstances.forEach(instance => {
      instance.scaling = new Vector3(newVoxelSize, newVoxelSize, newVoxelSize);
    });

    // Also check debug group children
    if (this._voxelDebugGroup) {
      const groupChildren = this._voxelDebugGroup.getChildMeshes();
      groupChildren.forEach(child => {
        if (child.name.startsWith('voxelInstance_')) {
          child.scaling = new Vector3(newVoxelSize, newVoxelSize, newVoxelSize);
        }
      });
    }
  }

  /**
   * Full regeneration of voxel debug (called after debounce)
   */
  private async regenerateVoxelDebug(newVoxelSize: number): Promise<void> {
    if (this._isUpdating) return;

    this._isUpdating = true;

    try {
      Log.InfoClass(this, 'Regenerating voxel debug with new size', {
        newVoxelSize,
        implementation: this._currentImplementation,
      });

      // Get current point clouds to regenerate voxel centers
      const pointClouds = this.getCurrentPointClouds();
      if (!pointClouds || pointClouds.length === 0) {
        Log.WarnClass(this, 'No point clouds available for voxel size update');
        return;
      }

      // Convert to Float32Array for voxel center calculation
      const allPositions: number[] = [];
      let globalMinX = Infinity,
        globalMinY = Infinity,
        globalMinZ = Infinity;
      let globalMaxX = -Infinity,
        globalMaxY = -Infinity,
        globalMaxZ = -Infinity;

      for (const cloud of pointClouds) {
        for (const point of cloud.points) {
          allPositions.push(
            point.position.x,
            point.position.y,
            point.position.z
          );

          if (point.position.x < globalMinX) globalMinX = point.position.x;
          if (point.position.y < globalMinY) globalMinY = point.position.y;
          if (point.position.z < globalMinZ) globalMinZ = point.position.z;
          if (point.position.x > globalMaxX) globalMaxX = point.position.x;
          if (point.position.y > globalMaxY) globalMaxY = point.position.y;
          if (point.position.z > globalMaxZ) globalMaxZ = point.position.z;
        }
      }

      const pointCloudData = new Float32Array(allPositions);
      const globalBounds = {
        minX: globalMinX,
        minY: globalMinY,
        minZ: globalMinZ,
        maxX: globalMaxX,
        maxY: globalMaxY,
        maxZ: globalMaxZ,
      };

      // Use the correct implementation to calculate voxel centers
      let voxelCenters: Float32Array;

      if (this._serviceManager?.toolsService?.voxelDownsampleDebugService) {
        // Use the proper implementation service
        const result =
          await this._serviceManager.toolsService.voxelDownsampleDebugService.generateVoxelCenters(
            {
              pointCloudData,
              voxelSize: newVoxelSize,
              globalBounds,
            },
            this._currentImplementation
          );

        if (result.success && result.voxelCenters) {
          voxelCenters = result.voxelCenters;
          Log.InfoClass(
            this,
            'Using correct implementation for voxel centers',
            {
              implementation: this._currentImplementation,
              voxelCount: result.voxelCenters.length / 3,
            }
          );
        } else {
          Log.ErrorClass(
            this,
            'Implementation failed, falling back to TypeScript',
            {
              error: result.error,
              implementation: this._currentImplementation,
            }
          );
          voxelCenters = this.calculateVoxelCenters(
            pointCloudData,
            newVoxelSize,
            globalBounds
          );
          Log.WarnClass(
            this,
            'Using TypeScript fallback - this should not happen!',
            {
              implementation: this._currentImplementation,
              voxelCount: voxelCenters.length / 3,
            }
          );
        }
      } else {
        // Fallback to TypeScript implementation
        Log.WarnClass(this, 'Service not available, using TypeScript fallback');
        voxelCenters = this.calculateVoxelCenters(
          pointCloudData,
          newVoxelSize,
          globalBounds
        );
      }

      // Hide existing debug and recreate with new positions
      this.hideVoxelDebug();
      this.showVoxelDebugWithCenters(
        voxelCenters,
        newVoxelSize,
        this._currentColor
      );

      Log.InfoClass(this, 'Regenerated voxel debug with new size', {
        newVoxelSize,
        voxelCount: voxelCenters.length / 3,
        implementation: this._currentImplementation,
      });
    } finally {
      this._isUpdating = false;
    }
  }

  /**
   * Calculate voxel centers using the same algorithm as other implementations
   */
  private calculateVoxelCenters(
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
  ): Float32Array {
    const pointCount = pointCloudData.length / 3;
    const voxelMap = new Map<
      string,
      {
        voxelX: number;
        voxelY: number;
        voxelZ: number;
        count: number;
        sumX: number;
        sumY: number;
        sumZ: number;
      }
    >();

    // Group points into voxels
    for (let i = 0; i < pointCount; i++) {
      const x = pointCloudData[i * 3];
      const y = pointCloudData[i * 3 + 1];
      const z = pointCloudData[i * 3 + 2];

      // Calculate voxel coordinates using Math.floor for consistency
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
          voxelX,
          voxelY,
          voxelZ,
          count: 1,
          sumX: x,
          sumY: y,
          sumZ: z,
        });
      }
    }

    // Convert to voxel grid centers
    const voxelCenters: number[] = [];
    for (const [_, voxel] of voxelMap) {
      // Calculate voxel grid position (center of voxel grid cell)
      const gridX = globalBounds.minX + (voxel.voxelX + 0.5) * voxelSize;
      const gridY = globalBounds.minY + (voxel.voxelY + 0.5) * voxelSize;
      const gridZ = globalBounds.minZ + (voxel.voxelZ + 0.5) * voxelSize;

      voxelCenters.push(gridX, gridY, gridZ);
    }

    return new Float32Array(voxelCenters);
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
  public showVoxelDebugWithCenters(
    voxelCenters: Float32Array,
    voxelSize: number,
    color: { r: number; g: number; b: number } = {
      r: 0 / 255,
      g: 100 / 255,
      b: 200 / 255,
    },
    maxVoxels: number = 2000
  ): void {
    Log.InfoClass(this, 'showVoxelDebugWithCenters called', {
      voxelCentersLength: voxelCenters.length,
      voxelSize,
      sceneAvailable: !!this._scene,
      color,
      implementation: this._currentImplementation,
      firstFewCenters: Array.from(voxelCenters.slice(0, 9)),
    });

    if (!this._scene) {
      Log.ErrorClass(this, 'Scene not available for voxel debug');
      return;
    }

    // Hide existing debug first
    this.hideVoxelDebug();

    // Create wireframe material with specified color
    const wireframeMaterial = new StandardMaterial(
      'voxelDebugMaterial',
      this._scene
    );
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
    const baseBox = MeshBuilder.CreateBox(
      'voxelTemplate',
      {
        size: 1, // Use standard size 1
        updatable: false,
      },
      this._scene
    );
    baseBox.material = wireframeMaterial;
    baseBox.isVisible = false;
    baseBox.parent = this._voxelDebugGroup;

    // Set the scaling to match the voxel size
    baseBox.scaling = new Vector3(voxelSize, voxelSize, voxelSize);
    Log.InfoClass(this, 'Base box created with scaling', {
      scaling: baseBox.scaling,
    });

    // Create instances for each voxel center
    const centerCount = voxelCenters.length / 3;
    Log.InfoClass(this, `Creating ${centerCount} voxel instances`);

    // Debug: Log first few voxel centers and check for duplicates
    const firstCenters = Array.from(
      { length: Math.min(5, centerCount) },
      (_, i) => ({
        x: voxelCenters[i * 3],
        y: voxelCenters[i * 3 + 1],
        z: voxelCenters[i * 3 + 2],
      })
    );
    Log.InfoClass(this, 'First 5 voxel centers', { firstCenters });

    // Debug: Check if voxel centers are all zeros or invalid
    const hasValidCenters = firstCenters.some(
      center => center.x !== 0 || center.y !== 0 || center.z !== 0
    );
    if (!hasValidCenters) {
      Log.WarnClass(this, 'All voxel centers appear to be zero or invalid!', {
        voxelCentersLength: voxelCenters.length,
        firstCenters: firstCenters,
        rawVoxelCenters: Array.from(voxelCenters).slice(0, 12),
      });
    }

    // Check if all centers are the same (indicates a problem)
    const uniqueCenters = new Set(
      firstCenters.map(c => `${c.x},${c.y},${c.z}`)
    );
    if (uniqueCenters.size === 1) {
      Log.WarnClass(
        this,
        'All voxel centers are identical! This indicates a problem with voxel generation.'
      );
    }

    // Limit the number of voxels to display for performance
    const voxelsToShow = Math.min(centerCount, maxVoxels);
    if (centerCount > maxVoxels) {
      Log.WarnClass(
        this,
        `Voxel limit (${maxVoxels}) reached, showing ${voxelsToShow} of ${centerCount} voxels`
      );
    }

    for (let i = 0; i < voxelsToShow; i++) {
      const x = voxelCenters[i * 3];
      const y = voxelCenters[i * 3 + 1];
      const z = voxelCenters[i * 3 + 2];

      // Convert coordinates from robotics (X=forward, Y=left, Z=up) to Babylon.js (X=right, Y=up, Z=forward)
      // This matches the transformation used in PointMesh.ts
      const babylonX = -y; // left -> right (negated)
      const babylonY = z; // up -> up
      const babylonZ = x; // forward -> forward

      const instance = baseBox.createInstance(`voxelInstance_${i}`);
      instance.position = new Vector3(babylonX, babylonY, babylonZ);
      instance.parent = this._voxelDebugGroup;

      if (i < 5) {
        // Log first 5 instances for debugging
        Log.InfoClass(this, `Created voxel instance ${i}`, {
          originalPos: { x, y, z },
          babylonPos: { x: babylonX, y: babylonY, z: babylonZ },
        });
      }
    }

    this._isVisible = true;
    Log.InfoClass(
      this,
      `Created ${centerCount} voxel debug instances successfully`
    );
  }

  /**
   * Get current point clouds for processing
   */
  public getCurrentPointClouds(): SimplifiedPointCloud[] {
    Log.InfoClass(this, 'getCurrentPointClouds called', {
      currentPointClouds: this._currentPointClouds?.length || 0,
      serviceManager: !!this._serviceManager,
    });

    // If we have cached point clouds, return them
    if (this._currentPointClouds && this._currentPointClouds.length > 0) {
      Log.InfoClass(this, 'Returning cached point clouds', {
        count: this._currentPointClouds.length,
      });
      return this._currentPointClouds;
    }

    // Try to get point clouds from the service manager
    if (this._serviceManager?.pointService) {
      const pointCloudIds =
        this._serviceManager.pointService.pointCloudIds || [];
      Log.InfoClass(this, 'Found point cloud IDs', { pointCloudIds });

      const pointClouds: SimplifiedPointCloud[] = [];
      for (const id of pointCloudIds) {
        const pointCloud = this._serviceManager.pointService.getPointCloud(id);
        if (pointCloud) {
          // Check if we have positions array (for point clouds created from Float32Array)
          if (pointCloud.positions && pointCloud.positions.length > 0) {
            Log.InfoClass(this, 'Found point cloud with positions array', {
              id,
              pointCount: pointCloud.positions.length / 3,
            });
            const points: Array<{
              position: { x: number; y: number; z: number };
            }> = [];
            const positions = pointCloud.positions;
            for (let i = 0; i < positions.length; i += 3) {
              points.push({
                position: {
                  x: positions[i],
                  y: positions[i + 1],
                  z: positions[i + 2],
                },
              });
            }
            pointClouds.push({ points });
          } else if (pointCloud.points && pointCloud.points.length > 0) {
            Log.InfoClass(this, 'Found point cloud', {
              id,
              pointCount: pointCloud.points.length,
            });
            pointClouds.push({
              points: pointCloud.points.map((p: PointCloudPoint) => ({
                position: { x: p.position.x, y: p.position.y, z: p.position.z },
              })),
            });
          }
        }
      }

      if (pointClouds.length > 0) {
        Log.InfoClass(this, 'Retrieved point clouds from service manager', {
          count: pointClouds.length,
        });
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
      const wireframeMaterial = new StandardMaterial(
        'voxelWireframeMaterial',
        this._scene
      );
      wireframeMaterial.wireframe = true;
      // Make darker and more saturated for better contrast
      const darkerColor = new Color3(0.0, 0.05, 0.3); // Darker blue for better contrast
      wireframeMaterial.diffuseColor = darkerColor;
      wireframeMaterial.emissiveColor = darkerColor;
      wireframeMaterial.specularColor = new Color3(0, 0, 0); // No specular highlights for solid appearance
      wireframeMaterial.ambientColor = darkerColor;
      wireframeMaterial.alpha = 1.0; // Fully opaque for solid appearance
      wireframeMaterial.backFaceCulling = false; // Show all faces

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
          if (
            px < minX ||
            px > maxX ||
            py < minY ||
            py > maxY ||
            pz < minZ ||
            pz > maxZ
          ) {
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
              Log.WarnClass(
                this,
                `Voxel limit (${MAX_VOXELS}) reached, some voxels will not be shown`
              );
              break;
            }
          }
        }
        if (voxelMap.size >= MAX_VOXELS) break;
      }

      // Create a single box to be instanced
      const baseBox = MeshBuilder.CreateBox(
        'voxelTemplate',
        {
          size: voxelSize,
          updatable: false,
        },
        this._scene
      );
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

    let globalMinX = Infinity,
      globalMinY = Infinity,
      globalMinZ = Infinity;
    let globalMaxX = -Infinity,
      globalMaxY = -Infinity,
      globalMaxZ = -Infinity;
    const pointClouds = [];

    for (const pointCloudId of allPointCloudIds) {
      const pointCloud =
        this._serviceManager.pointService.getPointCloud(pointCloudId);
      if (pointCloud && pointCloud.points) {
        const debugPoints = pointCloud.points.map((p: PointCloudPoint) => ({
          position: { x: p.position.x, y: p.position.y, z: p.position.z },
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
        maxZ: globalMaxZ,
      },
      pointClouds,
    };

    this.showVoxelDebug(debugOptions);
  }
}
