import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';
import type {
  PointCloudSmoothingParams,
  PointCloudSmoothingResult,
} from '../ToolsService';

export class PointCloudSmoothingTS extends BaseService {
  constructor(_serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  async pointCloudSmoothing(
    params: PointCloudSmoothingParams
  ): Promise<PointCloudSmoothingResult> {
    try {
      const startTime = performance.now();

      const pointCount = params.points.length / 3;
      const smoothedPoints = new Float32Array(params.points);

      // Ultra-optimized smoothing implementation using spatial hashing (O(n) complexity)
      const radiusSquared = params.smoothingRadius * params.smoothingRadius;
      const cellSize = params.smoothingRadius;
      const invCellSize = 1.0 / cellSize;

      // Find bounding box
      let minX = smoothedPoints[0],
        maxX = smoothedPoints[0];
      let minY = smoothedPoints[1],
        maxY = smoothedPoints[1];
      let minZ = smoothedPoints[2],
        maxZ = smoothedPoints[2];

      for (let i = 0; i < pointCount; i++) {
        const i3 = i * 3;
        minX = Math.min(minX, smoothedPoints[i3]);
        maxX = Math.max(maxX, smoothedPoints[i3]);
        minY = Math.min(minY, smoothedPoints[i3 + 1]);
        maxY = Math.max(maxY, smoothedPoints[i3 + 1]);
        minZ = Math.min(minZ, smoothedPoints[i3 + 2]);
        maxZ = Math.max(maxZ, smoothedPoints[i3 + 2]);
      }

      // Calculate grid dimensions
      const gridWidth = Math.floor((maxX - minX) * invCellSize) + 1;
      const gridHeight = Math.floor((maxY - minY) * invCellSize) + 1;
      const gridDepth = Math.floor((maxZ - minZ) * invCellSize) + 1;

      // Hash function to get grid index
      const getGridIndex = (x: number, y: number, z: number): number => {
        const gx = Math.floor((x - minX) * invCellSize);
        const gy = Math.floor((y - minY) * invCellSize);
        const gz = Math.floor((z - minZ) * invCellSize);
        return gx + gy * gridWidth + gz * gridWidth * gridHeight;
      };

      // OPTIMIZATION: Pre-allocate grid once, reuse structure (matching C++/Rust)
      const gridSize = gridWidth * gridHeight * gridDepth;
      const grid: number[][] = Array(gridSize);
      for (let i = 0; i < gridSize; i++) {
        grid[i] = [];
      }

      // OPTIMIZATION: Chunked processing for better cache locality (matching C++/Rust)
      const CHUNK_SIZE = 1024;

      for (let iter = 0; iter < params.iterations; iter++) {
        const tempPoints = new Float32Array(smoothedPoints);

        // OPTIMIZATION: Clear grid efficiently (reuse structure)
        for (let i = 0; i < gridSize; i++) {
          grid[i].length = 0; // Faster than creating new array
        }
        for (
          let chunkStart = 0;
          chunkStart < pointCount;
          chunkStart += CHUNK_SIZE
        ) {
          const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, pointCount);

          // Populate grid with current point positions
          for (let i = chunkStart; i < chunkEnd; i++) {
            const i3 = i * 3;
            const gridIndex = getGridIndex(
              tempPoints[i3],
              tempPoints[i3 + 1],
              tempPoints[i3 + 2]
            );
            if (gridIndex >= 0 && gridIndex < gridSize) {
              grid[gridIndex].push(i);
            }
          }
        }

        // OPTIMIZATION: Chunked processing for better cache locality
        for (
          let chunkStart = 0;
          chunkStart < pointCount;
          chunkStart += CHUNK_SIZE
        ) {
          const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, pointCount);

          for (let i = chunkStart; i < chunkEnd; i++) {
            const i3 = i * 3;
            const x = tempPoints[i3];
            const y = tempPoints[i3 + 1];
            const z = tempPoints[i3 + 2];

            let sumX = 0,
              sumY = 0,
              sumZ = 0;
            let count = 0;

            // Check neighboring grid cells (3x3x3 = 27 cells)
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                  const gridIndex = getGridIndex(
                    x + dx * cellSize,
                    y + dy * cellSize,
                    z + dz * cellSize
                  );
                  if (gridIndex >= 0 && gridIndex < gridSize) {
                    const cell = grid[gridIndex];
                    for (let jIdx = 0; jIdx < cell.length; jIdx++) {
                      const j = cell[jIdx];
                      if (i === j) continue;

                      const j3 = j * 3;
                      const dx2 = tempPoints[j3] - x;
                      const dy2 = tempPoints[j3 + 1] - y;
                      const dz2 = tempPoints[j3 + 2] - z;

                      const distanceSquared = dx2 * dx2 + dy2 * dy2 + dz2 * dz2;

                      if (distanceSquared <= radiusSquared) {
                        sumX += tempPoints[j3];
                        sumY += tempPoints[j3 + 1];
                        sumZ += tempPoints[j3 + 2];
                        count++;
                      }
                    }
                  }
                }
              }
            }

            // Apply smoothing if neighbors found
            if (count > 0) {
              smoothedPoints[i3] = (x + sumX) / (count + 1);
              smoothedPoints[i3 + 1] = (y + sumY) / (count + 1);
              smoothedPoints[i3 + 2] = (z + sumZ) / (count + 1);
            }
          }
        }
      }

      const processingTime = performance.now() - startTime;

      return {
        success: true,
        smoothedPoints,
        originalCount: pointCount,
        smoothedCount: pointCount,
        processingTime,
      };
    } catch (error) {
      Log.Error('PointCloudSmoothingTS', 'Point cloud smoothing failed', error);
      return {
        success: false,
        originalCount: 0,
        smoothedCount: 0,
        processingTime: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  dispose(): void {
    this.removeAllObservers();
  }
}
