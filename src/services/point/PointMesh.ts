import {
  Scene,
  PointsCloudSystem,
  Vector3,
  Color4
} from '@babylonjs/core';
import type { 
  PointCloudData, 
  RenderOptions 
} from './PointCloud';

/**
 * PointMesh - Handles point cloud mesh creation and management using PointsCloudSystem
 * Used internally by PointService
 */
export class PointMesh {
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Convert coordinates from robotics (X=forward, Y=left, Z=up) to Babylon.js (X=right, Y=up, Z=forward)
   */
  private convertRoboticsToBabylonJS(point: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const converted = {
      x: -point.y,  // left -> right
      y: point.z,   // up -> up  
      z: point.x    // forward -> forward
    };
    
    // Debug: Log coordinate conversion for first few points
    if (Math.random() < 0.001) { // Log ~0.1% of points
      console.log('PointMesh: Converting point:', point, '->', converted);
    }
    
    return converted;
  }

  /**
   * Fit camera to point cloud bounds
   */
  private fitCameraToPointCloud(mesh: any): void {
    if (!this.scene || !mesh) return;

    // Find the camera
    const camera = this.scene.activeCamera;
    if (!camera || camera.getClassName() !== 'ArcRotateCamera') return;

    const arcCamera = camera as any; // ArcRotateCamera
    
    // Get the bounding box
    const boundingInfo = mesh.getBoundingInfo();
    const boundingBox = boundingInfo.boundingBox;
    
    // Calculate center and size
    const center = boundingBox.center;
    const size = boundingBox.maximum.subtract(boundingBox.minimum);
    const maxSize = Math.max(size.x, size.y, size.z);
    
    console.log('PointMesh: Fitting camera to point cloud');
    console.log('PointMesh: Center:', center);
    console.log('PointMesh: Size:', size);
    console.log('PointMesh: Max size:', maxSize);
    
    // Set camera target to center of point cloud
    arcCamera.setTarget(center);
    
    // Set camera radius to fit the point cloud (correct API)
    const radius = maxSize * 2; // Add some padding
    arcCamera.radius = radius;
    
    console.log('PointMesh: Camera fitted - target:', arcCamera.getTarget(), 'radius:', arcCamera.radius);
  }

  /**
   * Create a point cloud mesh using PointsCloudSystem
   */
  createPointCloudMesh(id: string, pointCloudData: PointCloudData, options: RenderOptions): any {
    if (!this.scene) {
      return null;
    }
    
    if (!pointCloudData.points || pointCloudData.points.length === 0) {
      return null;
    }
    
    // Debug: Log point cloud info
    console.log(`PointMesh: Creating mesh ${id} with ${pointCloudData.points.length} points`);
    console.log('PointMesh: Bounds:', pointCloudData.metadata.bounds);
    console.log('PointMesh: First few points:', pointCloudData.points.slice(0, 3).map(p => p.position));
    
    // Create PointsCloudSystem
    const pcs = new PointsCloudSystem(`pointCloud_${id}`, 1, this.scene);
    
    // Add points to the system
    pointCloudData.points.forEach((point) => {
      pcs.addPoints(1, (particle: { position: Vector3; color: Color4; }) => {
        // Convert coordinates from robotics to Babylon.js
        const convertedPoint = this.convertRoboticsToBabylonJS(point.position);
        
        particle.position = new Vector3(convertedPoint.x, convertedPoint.y, convertedPoint.z);
        
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
    
    // Try to make the system visible immediately
    pcs.setParticles();

    // Build the mesh asynchronously but immediately
    pcs.buildMeshAsync().then(() => {
      console.log(`PointMesh: Mesh built for ${id}`);
      
      // Set point size and rendering mode
      if (pcs.mesh && pcs.mesh.material) {
        pcs.mesh.material.pointSize = options.pointSize;
        pcs.mesh.material.fillMode = 2; // BABYLON.Material.PointFillMode
        console.log(`PointMesh: Set point size to ${options.pointSize}`);
      }
      
      // CRITICAL: Set isUnIndexed to true for proper point cloud rendering
      if (pcs.mesh) {
        pcs.mesh.isUnIndexed = true;
        
        // Force the mesh to be visible immediately
        pcs.mesh.setEnabled(true);
        
        console.log(`PointMesh: Mesh enabled for ${id}, position:`, pcs.mesh.position);
        console.log(`PointMesh: Mesh bounding box:`, pcs.mesh.getBoundingInfo().boundingBox);
        
        // Try to fit camera to the point cloud (only for first batch)
        this.fitCameraToPointCloud(pcs.mesh);
      }
    }).catch((error) => {
      console.error(`PointMesh: Error building mesh for ${id}:`, error);
    });

    return pcs;
  }

  /**
   * Dispose of the PointMesh
   */
  dispose(): void {
    // No need to track meshes - they're managed by Babylon.js scene
  }
}