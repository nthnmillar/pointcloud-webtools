import {
  Scene,
  Color3,
  StandardMaterial,
  Mesh,
  VertexData
} from '@babylonjs/core';
import type { 
  PointCloudData, 
  RenderOptions 
} from '../../types/PointCloud';

/**
 * PointMesh - Handles point cloud mesh creation and management
 * Used internally by PointService
 */
export class PointMesh {
  private scene: Scene | null = null;
  private pointCloudMeshes: Map<string, Mesh> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Create a mesh for point cloud rendering
   */
  createPointCloudMesh(id: string, pointCloudData: PointCloudData, options: RenderOptions): Mesh {
    if (!this.scene) throw new Error('PointMesh: Scene not initialized');

    const points = pointCloudData.points;
    const positions: number[] = [];
    const colors: number[] = [];

    // Prepare vertex data
    for (const point of points) {
      // Position
      positions.push(point.position.x, point.position.y, point.position.z);
      
      // Color based on mode
      let color = { r: 1, g: 1, b: 1 }; // Default white
      
      if (options.colorMode === 'original' && point.color) {
        color = point.color;
      } else if (options.colorMode === 'intensity' && point.intensity !== undefined) {
        const intensity = point.intensity;
        color = { r: intensity, g: intensity, b: intensity };
      } else if (options.colorMode === 'height') {
        const normalizedHeight = (point.position.y - pointCloudData.metadata.bounds.min.y) / 
                                (pointCloudData.metadata.bounds.max.y - pointCloudData.metadata.bounds.min.y);
        color = this.heightToColor(normalizedHeight);
      } else if (options.colorMode === 'classification' && point.classification !== undefined) {
        color = this.classificationToColor(point.classification);
      }
      
      colors.push(color.r, color.g, color.b, 1.0);
    }

    // Create custom mesh
    const mesh = new Mesh(`pointCloud_${id}`, this.scene);
    
    // Create vertex data
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.colors = colors;
    vertexData.applyToMesh(mesh, true);

    // Create material
    const material = new StandardMaterial(`pointCloudMaterial_${id}`, this.scene);
    material.emissiveColor = new Color3(1, 1, 1);
    material.disableLighting = true;
    material.pointsCloud = true;
    material.pointSize = options.pointSize;
    mesh.material = material;

    // Store the mesh
    this.pointCloudMeshes.set(id, mesh);

    return mesh;
  }

  /**
   * Remove a point cloud mesh
   */
  removePointCloudMesh(id: string): void {
    const mesh = this.pointCloudMeshes.get(id);
    if (mesh) {
      mesh.dispose();
      this.pointCloudMeshes.delete(id);
    }
  }

  /**
   * Get a point cloud mesh by ID
   */
  getPointCloudMesh(id: string): Mesh | undefined {
    return this.pointCloudMeshes.get(id);
  }

  /**
   * Get all point cloud mesh IDs
   */
  get pointCloudMeshIds(): string[] {
    return Array.from(this.pointCloudMeshes.keys());
  }

  /**
   * Update mesh material properties
   */
  updateMeshMaterial(id: string, options: Partial<RenderOptions>): void {
    const mesh = this.pointCloudMeshes.get(id);
    if (!mesh || !mesh.material) return;

    const material = mesh.material as StandardMaterial;
    
    if (options.pointSize !== undefined) {
      material.pointSize = options.pointSize;
    }
  }

  /**
   * Dispose of all meshes
   */
  dispose(): void {
    this.pointCloudMeshes.forEach(mesh => mesh.dispose());
    this.pointCloudMeshes.clear();
  }

  /**
   * Convert height to color (blue to red gradient)
   */
  private heightToColor(normalizedHeight: number): { r: number; g: number; b: number } {
    const clampedHeight = Math.max(0, Math.min(1, normalizedHeight));
    
    if (clampedHeight < 0.5) {
      // Blue to green
      const t = clampedHeight * 2;
      return { r: 0, g: t, b: 1 - t };
    } else {
      // Green to red
      const t = (clampedHeight - 0.5) * 2;
      return { r: t, g: 1 - t, b: 0 };
    }
  }

  /**
   * Convert classification to color
   */
  private classificationToColor(classification: number): { r: number; g: number; b: number } {
    const colors = [
      { r: 0, g: 0, b: 0 },       // 0: Black
      { r: 1, g: 0, b: 0 },       // 1: Red
      { r: 0, g: 1, b: 0 },       // 2: Green
      { r: 0, g: 0, b: 1 },       // 3: Blue
      { r: 1, g: 1, b: 0 },       // 4: Yellow
      { r: 1, g: 0, b: 1 },       // 5: Magenta
      { r: 0, g: 1, b: 1 },       // 6: Cyan
      { r: 1, g: 0.5, b: 0 },     // 7: Orange
      { r: 0.5, g: 0, b: 1 },     // 8: Purple
      { r: 0, g: 0.5, b: 0 },     // 9: Dark Green
    ];
    
    return colors[classification % colors.length];
  }
}
