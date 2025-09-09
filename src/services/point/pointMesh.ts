import {
  Scene,
  PointsCloudSystem,
  Vector3,
  Color4
} from '@babylonjs/core';
import type { 
  PointCloudData, 
  RenderOptions 
} from './pointCloud';

/**
 * PointMesh - Handles point cloud mesh creation and management using PointsCloudSystem
 * Used internally by PointService
 */
export class PointMesh {
  private scene: Scene;
  private pointCloudSystems: Map<string, PointsCloudSystem> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Create a point cloud mesh using PointsCloudSystem
   */
  createPointCloudMesh(id: string, pointCloudData: PointCloudData, options: RenderOptions): any {
    // Create PointsCloudSystem
    const pcs = new PointsCloudSystem(`pointCloud_${id}`, 1, this.scene);
    
    // Add points to the system
    pointCloudData.points.forEach((point) => {
      pcs.addPoints(1, (particle: { position: Vector3; color: Color4; }) => {
        particle.position = new Vector3(point.position.x, point.position.y, point.position.z);
        
        // Color based on mode
        let color = { r: 1, g: 1, b: 1, a: 1 }; // Default white
        
        if (options.colorMode === 'original' && point.color) {
          color = { r: point.color.r, g: point.color.g, b: point.color.b, a: 1 };
        } else if (options.colorMode === 'intensity' && point.intensity !== undefined) {
          const intensity = point.intensity;
          color = { r: intensity, g: intensity, b: intensity, a: 1 };
        } else if (options.colorMode === 'height') {
          const normalizedHeight = (point.position.y - pointCloudData.metadata.bounds.min.y) / 
                                  (pointCloudData.metadata.bounds.max.y - pointCloudData.metadata.bounds.min.y);
          color = { r: normalizedHeight, g: normalizedHeight, b: normalizedHeight, a: 1 };
        }
        
        particle.color = new Color4(color.r, color.g, color.b, color.a);
      });
    });

    // Build the mesh
    pcs.buildMeshAsync().then(() => {
      // Set point size
      if (pcs.mesh && pcs.mesh.material) {
        pcs.mesh.material.pointSize = options.pointSize;
      }
    });

    // Store the system
    this.pointCloudSystems.set(id, pcs);

    return pcs;
  }

  /**
   * Get a point cloud system by ID
   */
  getPointCloudMesh(id: string): PointsCloudSystem | undefined {
    return this.pointCloudSystems.get(id);
  }

  /**
   * Get all point cloud system IDs
   */
  get pointCloudMeshIds(): string[] {
    return Array.from(this.pointCloudSystems.keys());
  }

  /**
   * Update mesh material properties
   */
  updateMeshMaterial(id: string, options: Partial<RenderOptions>): void {
    const pcs = this.pointCloudSystems.get(id);
    if (!pcs) return;
    
    if (options.pointSize !== undefined) {
      // If mesh is already built, update it directly
      if (pcs.mesh && pcs.mesh.material) {
        pcs.mesh.material.pointSize = options.pointSize;
      } else {
        // Store the point size to apply when mesh is built
        pcs.pointSize = options.pointSize;
      }
    }
  }

  /**
   * Remove point cloud mesh
   */
  removePointCloudMesh(id: string): void {
    const pcs = this.pointCloudSystems.get(id);
    if (pcs) {
      if (pcs.mesh) {
        pcs.mesh.dispose();
      }
      this.pointCloudSystems.delete(id);
    }
  }

  /**
   * Dispose of all meshes
   */
  dispose(): void {
    this.pointCloudSystems.forEach(pcs => {
      if (pcs.mesh) {
        pcs.mesh.dispose();
      }
    });
    this.pointCloudSystems.clear();
  }
}