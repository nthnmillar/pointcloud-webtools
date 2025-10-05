import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';

export interface VoxelDebugParams {
  pointCloudData: Float32Array;
  voxelSize: number;
  globalBounds: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  };
}

export interface VoxelDebugResult {
  success: boolean;
  voxelCenters?: Float32Array;
  voxelCount?: number;
  processingTime?: number;
  error?: string;
}

export class VoxelDownsampleDebugTS extends BaseService {
  constructor(_serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  async generateVoxelCenters(params: VoxelDebugParams): Promise<VoxelDebugResult> {
    console.log('🔧 TS Debug: generateVoxelCenters called', {
      pointCount: params.pointCloudData.length / 3,
      voxelSize: params.voxelSize,
      bounds: params.globalBounds
    });
    
    try {
      const startTime = performance.now();
      
      const pointCount = params.pointCloudData.length / 3;
      const voxelMap = new Map<string, {
        count: number;
        sumX: number;
        sumY: number;
        sumZ: number;
      }>();
      
      console.log('🎯 TS Debug: Generating voxel centers with voxel size:', params.voxelSize);
      console.log('🎯 TS Debug: Global bounds:', params.globalBounds);
      console.log('🎯 TS Debug: Point count:', pointCount);
      
      // Process each point to find voxel centers
      for (let i = 0; i < pointCount; i++) {
        const x = params.pointCloudData[i * 3];
        const y = params.pointCloudData[i * 3 + 1];
        const z = params.pointCloudData[i * 3 + 2];
        
        // Calculate voxel coordinates
        const voxelX = Math.floor((x - params.globalBounds.minX) / params.voxelSize);
        const voxelY = Math.floor((y - params.globalBounds.minY) / params.voxelSize);
        const voxelZ = Math.floor((z - params.globalBounds.minZ) / params.voxelSize);
        
        const voxelKey = `${voxelX},${voxelY},${voxelZ}`;
        
        if (voxelMap.has(voxelKey)) {
          const voxel = voxelMap.get(voxelKey)!;
          voxel.count++;
          voxel.sumX += x;
          voxel.sumY += y;
          voxel.sumZ += z;
        } else {
          voxelMap.set(voxelKey, {
            count: 1,
            sumX: x,
            sumY: y,
            sumZ: z
          });
        }
      }
      
      // Convert voxel centers to Float32Array
      const voxelCenters: number[] = [];
      for (const [voxelKey, voxel] of voxelMap) {
        // Calculate voxel center (average position)
        const centerX = voxel.sumX / voxel.count;
        const centerY = voxel.sumY / voxel.count;
        const centerZ = voxel.sumZ / voxel.count;
        
        voxelCenters.push(centerX, centerY, centerZ);
        
        // Debug: Log first few voxel centers
        if (voxelCenters.length <= 9) { // First 3 centers
          console.log('🎯 TS Debug: Voxel center:', {
            key: voxelKey,
            center: { x: centerX, y: centerY, z: centerZ },
            count: voxel.count
          });
        }
      }
      
      // Also calculate voxel grid positions for proper visualization
      const voxelGridPositions: number[] = [];
      for (const [voxelKey] of voxelMap) {
        // Parse voxel key to get grid coordinates
        const [voxelX, voxelY, voxelZ] = voxelKey.split(',').map(Number);
        
        // Calculate voxel grid position (center of voxel grid cell)
        const gridX = params.globalBounds.minX + (voxelX + 0.5) * params.voxelSize;
        const gridY = params.globalBounds.minY + (voxelY + 0.5) * params.voxelSize;
        const gridZ = params.globalBounds.minZ + (voxelZ + 0.5) * params.voxelSize;
        
        // Debug: Log first few grid positions to verify calculation
        if (voxelGridPositions.length < 9) { // First 3 positions
          console.log('🎯 TS Debug: Grid position calculation:', {
            voxelKey,
            voxelCoords: { x: voxelX, y: voxelY, z: voxelZ },
            bounds: { minX: params.globalBounds.minX, minY: params.globalBounds.minY, minZ: params.globalBounds.minZ },
            voxelSize: params.voxelSize,
            gridPos: { x: gridX, y: gridY, z: gridZ }
          });
        }
        
        voxelGridPositions.push(gridX, gridY, gridZ);
        
        // Debug: Log first few grid positions
        if (voxelGridPositions.length <= 9) { // First 3 positions
          console.log('🎯 TS Debug: Voxel grid position:', {
            key: voxelKey,
            gridPos: { x: gridX, y: gridY, z: gridZ },
            voxelSize: params.voxelSize
          });
        }
      }
      
      // Use grid positions instead of centers for proper visualization
      const finalVoxelCenters = new Float32Array(voxelGridPositions);
      
      console.log('🎯 TS Debug: Generated voxel centers:', {
        voxelCount: voxelMap.size,
        firstCenter: voxelCenters.length > 0 ? { x: voxelCenters[0], y: voxelCenters[1], z: voxelCenters[2] } : null
      });
      
      const processingTime = performance.now() - startTime;
      
      Log.Info('VoxelDownsampleDebugTS', 'Voxel centers generated', {
        voxelCount: voxelMap.size,
        processingTime: processingTime.toFixed(2) + 'ms'
      });

      return {
        success: true,
        voxelCenters: finalVoxelCenters,
        voxelCount: voxelMap.size,
        processingTime
      };
    } catch (error) {
      Log.Error('VoxelDownsampleDebugTS', 'Failed to generate voxel centers', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  dispose(): void {
    // Cleanup implementation if needed
  }
}
