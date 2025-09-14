import {
  Scene,
  PointsCloudSystem,
  Vector3,
  Color4,
  Camera
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
  private meshes: Map<string, PointsCloudSystem> = new Map();
  private performanceStats = {
    totalPointsRendered: 0,
    lastRenderTime: 0,
    averageRenderTime: 0
  };

  constructor(scene: Scene) {
    this.scene = scene;
  }



  /**
   * Create a point cloud mesh using PointsCloudSystem with performance optimizations
   */
  createPointCloudMesh(id: string, pointCloudData: PointCloudData, options: RenderOptions): any {
    if (!this.scene) {
      return null;
    }
    
    if (!pointCloudData.points || pointCloudData.points.length === 0) {
      return null;
    }
    
    const startTime = performance.now();
    
    // Remove existing mesh if it exists
    this.removeMesh(id);
    
    // Create PointsCloudSystem with optimized capacity
    const pcs = new PointsCloudSystem(`pointCloud_${id}`, 1, this.scene);
    this.meshes.set(id, pcs);
    
    // Apply level-of-detail based on point count
    const pointCount = this.calculateLODPointCount(pointCloudData.points.length, options);
    const pointsToRender = this.selectLODPoints(pointCloudData.points, pointCount);
    
    // Pre-allocate arrays for better performance
    const positions = new Float32Array(pointsToRender.length * 3);
    const colors = new Float32Array(pointsToRender.length * 4);
    
    // Process points in batches for better memory management
    const batchSize = 1000;
    for (let batchStart = 0; batchStart < pointsToRender.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, pointsToRender.length);
      
      for (let i = batchStart; i < batchEnd; i++) {
        const point = pointsToRender[i];
        const arrayIndex = i * 3;
        const colorIndex = i * 4;
        
        // Convert coordinates from robotics (X=forward, Y=left, Z=up) to Babylon.js (X=right, Y=up, Z=forward)
        positions[arrayIndex] = -point.position.y;     // left -> right
        positions[arrayIndex + 1] = point.position.z;  // up -> up  
        positions[arrayIndex + 2] = point.position.x;  // forward -> forward
        
        // Use simple white color for all points - no expensive calculations
        colors[colorIndex] = 1;     // R
        colors[colorIndex + 1] = 1; // G
        colors[colorIndex + 2] = 1; // B
        colors[colorIndex + 3] = 1; // A
      }
    }
    
    // Add points using the pre-allocated arrays - much more efficient
    pcs.addPoints(pointsToRender.length, (particle: { position: Vector3; color: Color4; }, index: number) => {
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
    });
    
    // Make the system visible immediately
    pcs.setParticles();
    
    // Build the mesh asynchronously but don't wait for it - this allows batches to process immediately
    pcs.buildMeshAsync();
    
    // Update performance stats
    const renderTime = performance.now() - startTime;
    this.performanceStats.lastRenderTime = renderTime;
    this.performanceStats.totalPointsRendered += pointsToRender.length;
    this.performanceStats.averageRenderTime = 
      (this.performanceStats.averageRenderTime + renderTime) / 2;
    
    // Log mesh creation
    console.log(`Created mesh: ${id}`);
    
    return pcs;
  }

  /**
   * Calculate level-of-detail point count based on total points and performance settings
   */
  private calculateLODPointCount(totalPoints: number, options: RenderOptions): number {
    // Base LOD thresholds
    const maxPoints = 50000; // Maximum points to render for performance
    const minPoints = 1000;  // Minimum points to maintain visual quality
    
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
   * Remove a mesh by ID
   */
  removeMesh(id: string): void {
    const mesh = this.meshes.get(id);
    if (mesh) {
      console.log(`Removed mesh: ${id}`);
      mesh.dispose();
      this.meshes.delete(id);
    }
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