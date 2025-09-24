import { Scene, PointsCloudSystem, Vector3, Color4 } from '@babylonjs/core';
import type { PointCloudData, RenderOptions } from './PointCloud';
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
   * Create a point cloud mesh using PointsCloudSystem with performance optimizations
   */
  async createPointCloudMesh(
    id: string,
    pointCloudData: PointCloudData,
    options: RenderOptions,
    batchSize: number = 1000
  ): Promise<any> {
    Log.Debug('PointMesh', 'Creating point cloud mesh', { id, hasScene: !!this.scene, pointCount: pointCloudData.points?.length || 0 });
    
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
              z: point.position.x
            },
            arrayIndex: arrayIndex,
            finalPosition: {
              x: positions[arrayIndex],
              y: positions[arrayIndex + 1],
              z: positions[arrayIndex + 2]
            }
          });
        }

        // Use simple white color for all points - no expensive calculations
        colors[colorIndex] = 1; // R
        colors[colorIndex + 1] = 1; // G
        colors[colorIndex + 2] = 1; // B
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
      Log.Error('PointMesh', 'Failed to add points', { id, error: error instanceof Error ? error.message : 'Unknown error' });
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
                sceneMeshNames: this.scene.meshes.map(m => m.name)
              });
          
          Log.Debug('PointMesh', 'Mesh enabled and visible', { 
            id, 
            isEnabled: pcs.mesh.isEnabled(), 
            isVisible: pcs.mesh.isVisible,
            position: pcs.mesh.position,
            boundingInfo: pcs.mesh.getBoundingInfo(),
            material: !!pcs.mesh.material,
            pointSize: pcs.mesh.material?.pointSize
          });
          
            // Debug: Check what's actually in the scene
            Log.Info('PointMesh', 'Scene contents after mesh creation', {
              sceneMeshes: this.scene.meshes.length,
              sceneMeshesList: this.scene.meshes.map(m => ({
                name: m.name,
                isEnabled: m.isEnabled(),
                isVisible: m.isVisible,
                position: m.position,
                boundingInfo: m.getBoundingInfo()
              })),
              pointCloudMesh: pcs.mesh.name,
              pointCloudMeshEnabled: pcs.mesh.isEnabled(),
              pointCloudMeshVisible: pcs.mesh.isVisible,
              pointCloudMeshPosition: pcs.mesh.position,
              pointCloudMeshBoundingInfo: pcs.mesh.getBoundingInfo(),
              pointCloudMeshWorldMatrix: pcs.mesh.getWorldMatrix(),
              pointCloudMeshAbsolutePosition: pcs.mesh.getAbsolutePosition()
            });

            // Additional debugging: Check if the mesh is actually being rendered
            setTimeout(() => {
              Log.Info('PointMesh', 'Mesh status after 100ms', {
                meshName: pcs.mesh.name,
                isEnabled: pcs.mesh.isEnabled(),
                isVisible: pcs.mesh.isVisible,
                position: pcs.mesh.position,
                boundingInfo: pcs.mesh.getBoundingInfo(),
                material: pcs.mesh.material ? {
                  pointSize: pcs.mesh.material.pointSize,
                  isVisible: pcs.mesh.material.isVisible,
                  hasTexture: !!pcs.mesh.material.diffuseTexture,
                  hasEmissiveTexture: !!pcs.mesh.material.emissiveTexture,
                  materialType: pcs.mesh.material.constructor.name
                } : null,
                sceneActiveCamera: this.scene.activeCamera ? {
                  position: this.scene.activeCamera.position,
                  target: this.scene.activeCamera.getTarget(),
                  fov: this.scene.activeCamera.fov
                } : null,
                // Check if the mesh is actually in the scene and being rendered
                meshInScene: pcs.mesh.isInScene,
                meshParent: pcs.mesh.parent,
                meshChildren: pcs.mesh.getChildMeshes().length,
                // Check WebGL context
                webglContext: this.scene.getEngine()._gl ? 'available' : 'not available'
              });
            }, 100);
        }
      } else {
        // If buildMeshAsync doesn't exist, try to build synchronously or use alternative method
        Log.Warn('PointMesh', 'buildMeshAsync not available, trying alternative approach', { id });
        
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
            pointSize: pcs.mesh.material?.pointSize
          });
        }
      }
    } catch (error) {
      Log.Error('PointMesh', 'Error building mesh', { id, error: error instanceof Error ? error.message : 'Unknown error' });
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
  private selectLODPoints(points: any[], targetCount: number): any[] {
    if (points.length <= targetCount) {
      return points;
    }

    // Simple uniform sampling for now - could be improved with spatial sampling
    const step = Math.floor(points.length / targetCount);
    const selectedPoints: any[] = [];

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
    for (const [id, mesh] of this.meshes) {
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
    const beforeRemove = this.scene.meshes.map(m => ({ name: m.name, type: m.constructor.name }));
    Log.Info('PointMesh', 'Scene contents before removing mesh', {
      meshId: id,
      sceneMeshCount: this.scene.meshes.length,
      sceneMeshes: beforeRemove
    });
    
    const mesh = this.meshes.get(id);
    if (mesh) {
      mesh.dispose();
      this.meshes.delete(id);
    }
    
    // Debug: Check scene contents after removing mesh
    const afterRemove = this.scene.meshes.map(m => ({ name: m.name, type: m.constructor.name }));
    Log.Info('PointMesh', 'Scene contents after removing mesh', {
      meshId: id,
      sceneMeshCount: this.scene.meshes.length,
      sceneMeshes: afterRemove
    });
  }

  /**
   * Dispose of the PointMesh
   */
  dispose(): void {
    // Dispose of all tracked meshes
    for (const [id, mesh] of this.meshes) {
      mesh.dispose();
    }
    this.meshes.clear();
  }
}
