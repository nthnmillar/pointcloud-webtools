import { ServiceManager } from '../../services/ServiceManager';
import { Log } from '../../utils/Log';

export interface CollectedPointData {
  pointCloudData: Float32Array;
  /** When source point clouds have hasColor and per-point color, R,G,B per point (same order as positions), 0–1 */
  colors?: Float32Array;
  /** When source has hasIntensity and per-point intensity (same order as positions) */
  intensities?: Float32Array;
  /** When source has hasClassification and per-point classification (same order as positions), 0–255 */
  classifications?: Uint8Array;
  globalBounds: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  };
}

/**
 * Collect all points from all point clouds in the scene and calculate global bounds
 */
export function collectAllPoints(
  serviceManager: ServiceManager | null
): CollectedPointData | null {
  if (!serviceManager?.pointService) {
    Log.Error('Tools', 'Point service not available');
    return null;
  }

  const allPointCloudIds = serviceManager.pointService.pointCloudIds || [];
  Log.Debug('Tools', 'Found point cloud IDs', allPointCloudIds);

  if (allPointCloudIds.length === 0) {
    Log.Error('Tools', 'No point clouds found in scene');
    return null;
  }

  // Collect all points from all point clouds (and optional colors, intensities, classifications)
  const allPositions: number[] = [];
  const allColors: number[] = [];
  const allIntensities: number[] = [];
  const allClassifications: number[] = [];
  let hasColor = false;
  let hasIntensity = false;
  let hasClassification = false;
  let globalMinX = Infinity,
    globalMinY = Infinity,
    globalMinZ = Infinity;
  let globalMaxX = -Infinity,
    globalMaxY = -Infinity,
    globalMaxZ = -Infinity;

  for (const pointCloudId of allPointCloudIds) {
    const pointCloud = serviceManager.pointService.getPointCloud(pointCloudId);
    Log.Debug('Tools', 'Checking point cloud', {
      id: pointCloudId,
      exists: !!pointCloud,
      hasPoints: !!pointCloud?.points,
      pointCount: pointCloud?.points?.length || 0,
      hasPositions: !!pointCloud?.positions,
      positionsLength: pointCloud?.positions?.length || 0,
      pointCloudKeys: pointCloud ? Object.keys(pointCloud) : [],
    });

    if (pointCloud) {
      const meta = pointCloud.metadata;
      const useColor =
        meta?.hasColor === true &&
        pointCloud.points?.length &&
        pointCloud.points.every(
          p =>
            p.color &&
            typeof p.color.r === 'number' &&
            typeof p.color.g === 'number' &&
            typeof p.color.b === 'number'
        );
      const useIntensity =
        meta?.hasIntensity === true &&
        pointCloud.points?.length &&
        pointCloud.points.every(
          p => typeof p.intensity === 'number' && !Number.isNaN(p.intensity)
        );
      const useClassification =
        meta?.hasClassification === true &&
        pointCloud.points?.length &&
        pointCloud.points.every(
          p =>
            typeof p.classification === 'number' &&
            p.classification >= 0 &&
            p.classification <= 255
        );

      // Check if we have positions array (for point clouds created from Float32Array)
      if (pointCloud.positions && pointCloud.positions.length > 0) {
        Log.Debug('Tools', 'Processing points from positions array', {
          id: pointCloudId,
          pointCount: pointCloud.positions.length / 3,
        });
        const positions = pointCloud.positions;
        const posPointCount = positions.length / 3;
        const posColorCount = positions.length; // R,G,B per point => length = pointCount*3
        const usePosColors =
          pointCloud.colors != null && pointCloud.colors.length === posColorCount;
        const usePosIntensities =
          pointCloud.intensities != null &&
          pointCloud.intensities.length === posPointCount;
        const usePosClassifications =
          pointCloud.classifications != null &&
          pointCloud.classifications.length === posPointCount;
        for (let i = 0; i < positions.length; i += 3) {
          const x = positions[i];
          const y = positions[i + 1];
          const z = positions[i + 2];
          allPositions.push(x, y, z);
          if (usePosColors && pointCloud.colors) {
            const ci = i;
            allColors.push(
              pointCloud.colors[ci],
              pointCloud.colors[ci + 1],
              pointCloud.colors[ci + 2]
            );
            hasColor = true;
          }
          if (usePosIntensities && pointCloud.intensities) {
            allIntensities.push(pointCloud.intensities[i / 3]);
            hasIntensity = true;
          }
          if (usePosClassifications && pointCloud.classifications) {
            allClassifications.push(pointCloud.classifications[i / 3]);
            hasClassification = true;
          }

          // Calculate global bounding box
          globalMinX = Math.min(globalMinX, x);
          globalMinY = Math.min(globalMinY, y);
          globalMinZ = Math.min(globalMinZ, z);
          globalMaxX = Math.max(globalMaxX, x);
          globalMaxY = Math.max(globalMaxY, y);
          globalMaxZ = Math.max(globalMaxZ, z);
        }
      } else if (pointCloud.points && pointCloud.points.length > 0) {
        Log.Debug('Tools', 'Processing points from point cloud', {
          id: pointCloudId,
          pointCount: pointCloud.points.length,
        });
        for (const point of pointCloud.points) {
          allPositions.push(
            point.position.x,
            point.position.y,
            point.position.z
          );
          if (useColor && point.color) {
            allColors.push(point.color.r, point.color.g, point.color.b);
            hasColor = true;
          }
          if (useIntensity && point.intensity != null) {
            allIntensities.push(point.intensity);
            hasIntensity = true;
          }
          if (useClassification && point.classification != null) {
            allClassifications.push(point.classification);
            hasClassification = true;
          }

          // Calculate global bounding box
          globalMinX = Math.min(globalMinX, point.position.x);
          globalMinY = Math.min(globalMinY, point.position.y);
          globalMinZ = Math.min(globalMinZ, point.position.z);
          globalMaxX = Math.max(globalMaxX, point.position.x);
          globalMaxY = Math.max(globalMaxY, point.position.y);
          globalMaxZ = Math.max(globalMaxZ, point.position.z);
        }
      } else {
        Log.Warn('Tools', 'Point cloud has no valid points or positions', {
          id: pointCloudId,
          pointCloud: pointCloud ? 'exists' : 'null',
          hasPoints: !!pointCloud?.points,
          pointCount: pointCloud?.points?.length || 0,
          hasPositions: !!pointCloud?.positions,
          positionsLength: pointCloud?.positions?.length || 0,
        });
      }
    }
  }

  if (allPositions.length === 0) {
    Log.Error('Tools', 'No valid points found');
    return null;
  }

  const pointCloudData = new Float32Array(allPositions);
  const pointCount = allPositions.length / 3;
  const colors =
    hasColor && allColors.length === allPositions.length
      ? new Float32Array(allColors)
      : undefined;
  const intensities =
    hasIntensity && allIntensities.length === pointCount
      ? new Float32Array(allIntensities)
      : undefined;
  const classifications =
    hasClassification && allClassifications.length === pointCount
      ? new Uint8Array(allClassifications)
      : undefined;

  return {
    pointCloudData,
    colors,
    intensities,
    classifications,
    globalBounds: {
      minX: globalMinX,
      minY: globalMinY,
      minZ: globalMinZ,
      maxX: globalMaxX,
      maxY: globalMaxY,
      maxZ: globalMaxZ,
    },
  };
}

/**
 * Collect all points from all point clouds in the scene (for smoothing - no bounds needed)
 */
export function collectAllPointsForSmoothing(
  serviceManager: ServiceManager | null
): Float32Array | null {
  if (!serviceManager?.pointService) {
    Log.Error('Tools', 'Point service not available');
    return null;
  }

  const allPointCloudIds = serviceManager.pointService.pointCloudIds || [];
  Log.Debug('Tools', 'Found point cloud IDs', allPointCloudIds);

  if (allPointCloudIds.length === 0) {
    Log.Error('Tools', 'No point clouds found in scene');
    return null;
  }

  const allPositions: number[] = [];

  for (const pointCloudId of allPointCloudIds) {
    const pointCloud = serviceManager.pointService.getPointCloud(pointCloudId);
    if (pointCloud) {
      // Check if we have positions array (for point clouds created from Float32Array)
      if (pointCloud.positions && pointCloud.positions.length > 0) {
        const positions = pointCloud.positions;
        for (let i = 0; i < positions.length; i += 3) {
          allPositions.push(positions[i], positions[i + 1], positions[i + 2]);
        }
      } else if (pointCloud.points && pointCloud.points.length > 0) {
        for (const point of pointCloud.points) {
          allPositions.push(
            point.position.x,
            point.position.y,
            point.position.z
          );
        }
      }
    }
  }

  if (allPositions.length === 0) {
    Log.Error('Tools', 'No valid points found');
    return null;
  }

  return new Float32Array(allPositions);
}
