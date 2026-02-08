import { BaseService } from '../../BaseService';
import type { ServiceManager } from '../../ServiceManager';
import { Log } from '../../../utils/Log';
import type {
  VoxelDownsampleParams,
  VoxelDownsampleResult,
} from '../ToolsService';

export class VoxelDownsamplingTS extends BaseService {
  constructor(_serviceManager: ServiceManager) {
    super();
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  async voxelDownsample(
    params: VoxelDownsampleParams
  ): Promise<VoxelDownsampleResult> {
    try {
      const startTime = performance.now();

      const pointCount = params.pointCloudData.length / 3;
      const useColors =
        params.colors != null && params.colors.length === pointCount * 3;
      const useIntensity =
        params.intensities != null && params.intensities.length === pointCount;
      const useClassification =
        params.classifications != null &&
        params.classifications.length === pointCount;

      type VoxelEntry = {
        count: number;
        sumX: number;
        sumY: number;
        sumZ: number;
        sumR?: number;
        sumG?: number;
        sumB?: number;
        sumIntensity?: number;
        classCounts?: Map<number, number>;
      };
      const voxelMap = new Map<string, VoxelEntry>();

      // OPTIMIZATION: Pre-calculate inverse voxel size (outside loop)
      const invVoxelSize = 1.0 / params.voxelSize;

      // OPTIMIZATION: Chunked processing for better cache locality (matching C++/Rust)
      const CHUNK_SIZE = 1024;
      for (
        let chunkStart = 0;
        chunkStart < pointCount;
        chunkStart += CHUNK_SIZE
      ) {
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, pointCount);

        for (let i = chunkStart; i < chunkEnd; i++) {
          const i3 = i * 3;
          const x = params.pointCloudData[i3];
          const y = params.pointCloudData[i3 + 1];
          const z = params.pointCloudData[i3 + 2];

          const voxelX = Math.floor(
            (x - params.globalBounds.minX) * invVoxelSize
          );
          const voxelY = Math.floor(
            (y - params.globalBounds.minY) * invVoxelSize
          );
          const voxelZ = Math.floor(
            (z - params.globalBounds.minZ) * invVoxelSize
          );

          const voxelKey = `${voxelX},${voxelY},${voxelZ}`;

          if (voxelMap.has(voxelKey)) {
            const voxel = voxelMap.get(voxelKey)!;
            voxel.count++;
            voxel.sumX += x;
            voxel.sumY += y;
            voxel.sumZ += z;
            if (useColors && params.colors) {
              voxel.sumR! += params.colors[i3];
              voxel.sumG! += params.colors[i3 + 1];
              voxel.sumB! += params.colors[i3 + 2];
            }
            if (useIntensity && params.intensities) {
              voxel.sumIntensity! += params.intensities[i];
            }
            if (useClassification && params.classifications) {
              const c = params.classifications[i];
              voxel.classCounts!.set(c, (voxel.classCounts!.get(c) ?? 0) + 1);
            }
          } else {
            const entry: VoxelEntry = {
              count: 1,
              sumX: x,
              sumY: y,
              sumZ: z,
            };
            if (useColors && params.colors) {
              entry.sumR = params.colors[i3];
              entry.sumG = params.colors[i3 + 1];
              entry.sumB = params.colors[i3 + 2];
            }
            if (useIntensity && params.intensities) {
              entry.sumIntensity = params.intensities[i];
            }
            if (useClassification && params.classifications) {
              entry.classCounts = new Map();
              entry.classCounts.set(params.classifications[i], 1);
            }
            voxelMap.set(voxelKey, entry);
          }
        }
      }

      const voxelCount = voxelMap.size;
      const downsampledPoints = new Float32Array(voxelCount * 3);
      const downsampledColors = useColors
        ? new Float32Array(voxelCount * 3)
        : undefined;
      const downsampledIntensities = useIntensity
        ? new Float32Array(voxelCount)
        : undefined;
      const downsampledClassifications = useClassification
        ? new Uint8Array(voxelCount)
        : undefined;

      let outputIndex = 0;
      let outVoxelIndex = 0;
      for (const [, voxel] of voxelMap) {
        downsampledPoints[outputIndex++] = voxel.sumX / voxel.count;
        downsampledPoints[outputIndex++] = voxel.sumY / voxel.count;
        downsampledPoints[outputIndex++] = voxel.sumZ / voxel.count;
        if (downsampledColors && voxel.sumR != null) {
          downsampledColors[outVoxelIndex * 3] = voxel.sumR / voxel.count;
          downsampledColors[outVoxelIndex * 3 + 1] = voxel.sumG! / voxel.count;
          downsampledColors[outVoxelIndex * 3 + 2] = voxel.sumB! / voxel.count;
        }
        if (downsampledIntensities && voxel.sumIntensity != null) {
          downsampledIntensities[outVoxelIndex] = voxel.sumIntensity / voxel.count;
        }
        if (downsampledClassifications && voxel.classCounts) {
          let maxCount = 0;
          let mode = 0;
          voxel.classCounts.forEach((count, cls) => {
            if (count > maxCount) {
              maxCount = count;
              mode = cls;
            }
          });
          downsampledClassifications[outVoxelIndex] = mode;
        }
        outVoxelIndex++;
      }

      const processingTime = performance.now() - startTime;

      return {
        success: true,
        downsampledPoints,
        downsampledColors,
        downsampledIntensities,
        downsampledClassifications,
        originalCount: pointCount,
        downsampledCount: voxelCount,
        processingTime,
        voxelCount,
      };
    } catch (error) {
      Log.Error('VoxelDownsamplingTS', 'Voxel downsampling failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  dispose(): void {
    // Cleanup implementation if needed
  }
}
