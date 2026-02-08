import { Scene, PointsCloudSystem, Vector3, Color4 } from '@babylonjs/core';
import type {
  PointCloudData,
  RenderOptions,
  PointCloudMetadata,
  PointCloudPoint,
} from './PointCloud';
import { Log } from '../../utils/Log';

/**
 * PointMesh - Handles point cloud mesh creation and management using PointsCloudSystem
 * Used internally by PointService
 */
export class PointMesh {
  private scene: Scene;
  private meshes: Map<string, PointsCloudSystem> = new Map();
  private performanceStats = {
    totalPointsRendered: 0,
    lastRenderTime: 0,
    averageRenderTime: 0,
  };

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Create a point cloud mesh from Float32Array directly (optimized for WASM results)
   * This avoids creating intermediate JS objects
   */
  async createPointCloudMeshFromFloat32Array(
    id: string,
    positions: Float32Array,
    color: { r: number; g: number; b: number } = { r: 1, g: 1, b: 1 },
    _metadata: Partial<PointCloudMetadata>,
    options: RenderOptions,
    perPointColors?: Float32Array
  ): Promise<PointsCloudSystem | null> {
    Log.Debug('PointMesh', 'Creating point cloud mesh from Float32Array', {
      id,
      pointCount: positions.length / 3,
    });

    if (!this.scene) {
      Log.Error('PointMesh', 'No scene available');
      return null;
    }

    if (positions.length === 0 || positions.length % 3 !== 0) {
      Log.Error('PointMesh', 'Invalid positions array');
      return null;
    }

    const startTime = performance.now();
    const pointCount = positions.length / 3;

    // Remove existing mesh if it exists
    this.removeMesh(id);

    // Create PointsCloudSystem with optimized capacity
    const pcs = new PointsCloudSystem(`pointCloud_${id}`, 1, this.scene);
    this.meshes.set(id, pcs);

    // Apply level-of-detail based on point count
    const lodPointCount = this.calculateLODPointCount(pointCount, options);
    const step =
      pointCount > lodPointCount ? Math.floor(pointCount / lodPointCount) : 1;
    const pointsToRender = Math.min(lodPointCount, pointCount);

    // Pre-allocate arrays for better performance
    const transformedPositions = new Float32Array(pointsToRender * 3);
    const colors = new Float32Array(pointsToRender * 4);

    // Process points in batches
    const usePerPointColors =
      perPointColors != null && perPointColors.length >= pointCount * 3;
    let renderIndex = 0;
    for (let i = 0; i < pointCount && renderIndex < pointsToRender; i += step) {
      const srcIndex = i * 3;
      const dstIndex = renderIndex * 3;
      const colorIndex = renderIndex * 4;

      // Convert coordinates from robotics (X=forward, Y=left, Z=up) to Babylon.js (X=right, Y=up, Z=forward)
      transformedPositions[dstIndex] = -positions[srcIndex + 1]; // left -> right
      transformedPositions[dstIndex + 1] = positions[srcIndex + 2]; // up -> up
      transformedPositions[dstIndex + 2] = positions[srcIndex]; // forward -> forward

      if (usePerPointColors && perPointColors) {
        colors[colorIndex] = perPointColors[srcIndex];
        colors[colorIndex + 1] = perPointColors[srcIndex + 1];
        colors[colorIndex + 2] = perPointColors[srcIndex + 2];
      } else {
        colors[colorIndex] = color.r;
        colors[colorIndex + 1] = color.g;
        colors[colorIndex + 2] = color.b;
      }
      colors[colorIndex + 3] = 1; // A

      renderIndex++;
    }

    // Add points using the pre-allocated arrays
    try {
      pcs.addPoints(
        renderIndex,
        (particle: { position: Vector3; color: Color4 }, index: number) => {
          const arrayIndex = index * 3;
          const colorIndex = index * 4;

          particle.position.set(
            transformedPositions[arrayIndex],
            transformedPositions[arrayIndex + 1],
            transformedPositions[arrayIndex + 2]
          );

          particle.color.set(
            colors[colorIndex],
            colors[colorIndex + 1],
            colors[colorIndex + 2],
            colors[colorIndex + 3]
          );
        }
      );
    } catch (error) {
      Log.Error('PointMesh', 'Failed to add points', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }

    // Make the system visible immediately
    pcs.setParticles();

    // Build the mesh
    try {
      if (typeof pcs.buildMeshAsync === 'function') {
        await pcs.buildMeshAsync();

        if (pcs.mesh && pcs.mesh.material) {
          pcs.mesh.material.pointSize = options.pointSize;
          pcs.mesh.setEnabled(true);
          pcs.mesh.isVisible = true;
        }
      }
    } catch (error) {
      Log.Error('PointMesh', 'Error building mesh', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Update performance stats
    const renderTime = performance.now() - startTime;
    this.performanceStats.lastRenderTime = renderTime;
    this.performanceStats.totalPointsRendered += renderIndex;
    this.performanceStats.averageRenderTime =
      (this.performanceStats.averageRenderTime + renderTime) / 2;

    return pcs;
  }

  /**
   * Create a point cloud mesh using PointsCloudSystem with performance optimizations
   */
  async createPointCloudMesh(
    id: string,
    pointCloudData: PointCloudData,
    options: RenderOptions,
    batchSize: number = 1000
  ): Promise<PointsCloudSystem | null> {
    Log.Debug('PointMesh', 'Creating point cloud mesh', {
      id,
      hasScene: !!this.scene,
      pointCount: pointCloudData.points?.length || 0,
    });

    if (!this.scene) {
      Log.Error('PointMesh', 'No scene available');
      return null;
    }

    if (!pointCloudData.points || pointCloudData.points.length === 0) {
      Log.Error('PointMesh', 'No points data available');
      return null;
    }

    const startTime = performance.now();

    // Remove existing mesh if it exists
    this.removeMesh(id);

    // Create PointsCloudSystem with optimized capacity
    const pcs = new PointsCloudSystem(`pointCloud_${id}`, 1, this.scene);

    this.meshes.set(id, pcs);

    // Apply level-of-detail based on point count
    const pointCount = this.calculateLODPointCount(
      pointCloudData.points.length,
      options
    );
    const pointsToRender = this.selectLODPoints(
      pointCloudData.points,
      pointCount
    );

    // Pre-allocate arrays for better performance
    const positions = new Float32Array(pointsToRender.length * 3);
    const colors = new Float32Array(pointsToRender.length * 4);

    // Process points in batches for better memory management
    // batchSize is now passed as parameter
    for (
      let batchStart = 0;
      batchStart < pointsToRender.length;
      batchStart += batchSize
    ) {
      const batchEnd = Math.min(batchStart + batchSize, pointsToRender.length);

      for (let i = batchStart; i < batchEnd; i++) {
        const point = pointsToRender[i];
        const arrayIndex = i * 3;
        const colorIndex = i * 4;

        // Convert coordinates from robotics (X=forward, Y=left, Z=up) to Babylon.js (X=right, Y=up, Z=forward)
        positions[arrayIndex] = -point.position.y; // left -> right
        positions[arrayIndex + 1] = point.position.z; // up -> up
        positions[arrayIndex + 2] = point.position.x; // forward -> forward

        // Debug: Log first few transformed positions
        if (i < 3) {
          Log.Debug('PointMesh', 'Coordinate transformation', {
            original: point.position,
            transformed: {
              x: -point.position.y,
              y: point.position.z,
              z: point.position.x,
            },
            arrayIndex: arrayIndex,
            finalPosition: {
              x: positions[arrayIndex],
              y: positions[arrayIndex + 1],
              z: positions[arrayIndex + 2],
            },
          });
        }

        // Use per-point color when present, otherwise white
        const useColor =
          pointCloudData.metadata.hasColor &&
          point.color &&
          typeof point.color.r === 'number' &&
          typeof point.color.g === 'number' &&
          typeof point.color.b === 'number';
        colors[colorIndex] = useColor ? point.color!.r : 1;
        colors[colorIndex + 1] = useColor ? point.color!.g : 1;
        colors[colorIndex + 2] = useColor ? point.color!.b : 1;
        colors[colorIndex + 3] = 1; // A
      }
    }

    // Add points using the pre-allocated arrays - much more efficient
    try {
      pcs.addPoints(
        pointsToRender.length,
        (particle: { position: Vector3; color: Color4 }, index: number) => {
          const arrayIndex = index * 3;
          const colorIndex = index * 4;

          // Reuse Vector3 and Color4 objects to reduce garbage collection
          particle.position.set(
            positions[arrayIndex],
            positions[arrayIndex + 1],
            positions[arrayIndex + 2]
          );

          particle.color.set(
            colors[colorIndex],
            colors[colorIndex + 1],
            colors[colorIndex + 2],
            colors[colorIndex + 3]
          );
        }
      );
    } catch (error) {
      Log.Error('PointMesh', 'Failed to add points', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }

    // Make the system visible immediately
    pcs.setParticles();

    // Try to build the mesh - check if buildMeshAsync exists first
    try {
      if (typeof pcs.buildMeshAsync === 'function') {
        await pcs.buildMeshAsync();

        // Set point size after mesh is built
        if (pcs.mesh && pcs.mesh.material) {
          pcs.mesh.material.pointSize = options.pointSize;
        }

        // Ensure the mesh is visible
        if (pcs.mesh) {
          pcs.mesh.setEnabled(true);
          pcs.mesh.isVisible = true;

          // Make points much larger for debugging
          if (pcs.mesh.material) {
            pcs.mesh.material.pointSize = 2; // Default point size
          }

          // Debug: Check if mesh is actually in the scene
          Log.Info('PointMesh', 'Mesh added to scene check', {
            meshName: pcs.mesh.name,
            meshInScene: this.scene.meshes.includes(pcs.mesh),
            sceneMeshCount: this.scene.meshes.length,
            sceneMeshNames: this.scene.meshes.map(m => m.name),
          });

          Log.Debug('PointMesh', 'Mesh enabled and visible', {
            id,
            isEnabled: pcs.mesh.isEnabled(),
            isVisible: pcs.mesh.isVisible,
            position: pcs.mesh.position,
            boundingInfo: pcs.mesh.getBoundingInfo(),
            material: !!pcs.mesh.material,
            pointSize: pcs.mesh.material?.pointSize,
          });

          // Debug: Check what's actually in the scene
          Log.Info('PointMesh', 'Scene contents after mesh creation', {
            sceneMeshes: this.scene.meshes.length,
            sceneMeshesList: this.scene.meshes.map(m => ({
              name: m.name,
              isEnabled: m.isEnabled(),
              isVisible: m.isVisible,
              position: m.position,
              boundingInfo: m.getBoundingInfo(),
            })),
            pointCloudMesh: pcs.mesh.name,
            pointCloudMeshEnabled: pcs.mesh.isEnabled(),
            pointCloudMeshVisible: pcs.mesh.isVisible,
            pointCloudMeshPosition: pcs.mesh.position,
            pointCloudMeshBoundingInfo: pcs.mesh.getBoundingInfo(),
            pointCloudMeshWorldMatrix: pcs.mesh.getWorldMatrix(),
            pointCloudMeshAbsolutePosition: pcs.mesh.getAbsolutePosition(),
          });

          // Additional debugging: Check if the mesh is actually being rendered
          setTimeout(() => {
            Log.Info('PointMesh', 'Mesh status after 100ms', {
              meshName: pcs.mesh?.name,
              isEnabled: pcs.mesh?.isEnabled(),
              isVisible: pcs.mesh?.isVisible,
              position: pcs.mesh?.position,
              boundingInfo: pcs.mesh?.getBoundingInfo(),
              material: pcs.mesh?.material
                ? {
                    pointSize: pcs.mesh.material.pointSize,
                    materialType: pcs.mesh.material.constructor.name,
                  }
                : null,
              sceneActiveCamera: this.scene.activeCamera
                ? {
                    position: this.scene.activeCamera.position,
                    // Use 'target' property if available, otherwise fallback to null
                    target:
                      'target' in this.scene.activeCamera &&
                      this.scene.activeCamera.target
                        ? this.scene.activeCamera.target
                        : null,
                    fov: this.scene.activeCamera.fov,
                  }
                : null,
              // Check if the mesh is actually in the scene and being rendered
              meshInScene: pcs.mesh
                ? this.scene.meshes.includes(pcs.mesh)
                : false,
              meshParent: pcs.mesh?.parent,
              meshChildren: pcs.mesh?.getChildMeshes().length,
              // Check WebGL context
              webglContext: 'available', // WebGL context is available if scene is rendering
            });
          }, 100);
        }
      } else {
        // If buildMeshAsync doesn't exist, try to build synchronously or use alternative method
        Log.Warn(
          'PointMesh',
          'buildMeshAsync not available, trying alternative approach',
          { id }
        );

        // Try to force the mesh creation
        if (pcs.mesh) {
          pcs.mesh.setEnabled(true);
          pcs.mesh.isVisible = true;
          Log.Debug('PointMesh', 'Mesh enabled and visible', {
            id,
            isEnabled: pcs.mesh.isEnabled(),
            isVisible: pcs.mesh.isVisible,
            position: pcs.mesh.position,
            boundingInfo: pcs.mesh.getBoundingInfo(),
            material: !!pcs.mesh.material,
            pointSize: pcs.mesh.material?.pointSize,
          });
        }
      }
    } catch (error) {
      Log.Error('PointMesh', 'Error building mesh', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Update performance stats
    const renderTime = performance.now() - startTime;
    this.performanceStats.lastRenderTime = renderTime;
    this.performanceStats.totalPointsRendered += pointsToRender.length;
    this.performanceStats.averageRenderTime =
      (this.performanceStats.averageRenderTime + renderTime) / 2;

    // Log mesh creation

    return pcs;
  }

  /**
   * Calculate level-of-detail point count based on total points and performance settings
   */
  private calculateLODPointCount(
    totalPoints: number,
    options: RenderOptions
  ): number {
    // Base LOD thresholds
    const maxPoints = 50000; // Maximum points to render for performance
    const minPoints = 1000; // Minimum points to maintain visual quality

    if (totalPoints <= maxPoints) {
      return totalPoints;
    }

    // Scale down based on point size (smaller points = can handle more)
    const scaleFactor = Math.max(0.1, 2.0 / options.pointSize);
    const scaledMaxPoints = Math.floor(maxPoints * scaleFactor);

    return Math.max(minPoints, Math.min(scaledMaxPoints, totalPoints));
  }

  /**
   * Select points for level-of-detail rendering
   */
  private selectLODPoints(
    points: PointCloudPoint[],
    targetCount: number
  ): PointCloudPoint[] {
    if (points.length <= targetCount) {
      return points;
    }

    // Simple uniform sampling for now - could be improved with spatial sampling
    const step = Math.floor(points.length / targetCount);
    const selectedPoints: PointCloudPoint[] = [];

    for (let i = 0; i < points.length; i += step) {
      selectedPoints.push(points[i]);
      if (selectedPoints.length >= targetCount) {
        break;
      }
    }

    return selectedPoints;
  }

  /**
   * Update point size for a specific mesh
   */
  updatePointSize(id: string, pointSize: number): void {
    const mesh = this.meshes.get(id);
    if (mesh && mesh.mesh && mesh.mesh.material) {
      mesh.mesh.material.pointSize = pointSize;
    }
  }

  /**
   * Update point size for all meshes
   */
  updateAllPointSizes(pointSize: number): void {
    for (const [, mesh] of this.meshes) {
      if (mesh.mesh && mesh.mesh.material) {
        mesh.mesh.material.pointSize = pointSize;
      }
    }
  }

  /**
   * Remove a mesh by ID
   */
  removeMesh(id: string): void {
    // Debug: Check scene contents before removing mesh
    const beforeRemove = this.scene.meshes.map(m => ({
      name: m.name,
      type: m.constructor.name,
    }));
    Log.Info('PointMesh', 'Scene contents before removing mesh', {
      meshId: id,
      sceneMeshCount: this.scene.meshes.length,
      sceneMeshes: beforeRemove,
    });

    const mesh = this.meshes.get(id);
    if (mesh) {
      mesh.dispose();
      this.meshes.delete(id);
    }

    // Debug: Check scene contents after removing mesh
    const afterRemove = this.scene.meshes.map(m => ({
      name: m.name,
      type: m.constructor.name,
    }));
    Log.Info('PointMesh', 'Scene contents after removing mesh', {
      meshId: id,
      sceneMeshCount: this.scene.meshes.length,
      sceneMeshes: afterRemove,
    });
  }

  /**
   * Dispose of the PointMesh
   */
  dispose(): void {
    // Dispose of all tracked meshes
    for (const [, mesh] of this.meshes) {
      mesh.dispose();
    }
    this.meshes.clear();
  }
}
