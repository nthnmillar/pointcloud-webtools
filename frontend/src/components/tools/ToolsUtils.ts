import { ServiceManager } from '../../services/ServiceManager';
import { Log } from '../../utils/Log';

export interface CollectedPointData {
  pointCloudData: Float32Array;
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
export function collectAllPoints(serviceManager: ServiceManager | null): CollectedPointData | null {
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

  // Collect all points from all point clouds
  const allPositions: number[] = [];
  let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
  let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

  for (const pointCloudId of allPointCloudIds) {
    const pointCloud = serviceManager.pointService.getPointCloud(pointCloudId);
    if (pointCloud && pointCloud.points && pointCloud.points.length > 0) {
      for (const point of pointCloud.points) {
        allPositions.push(point.position.x, point.position.y, point.position.z);
        
        // Calculate global bounding box
        globalMinX = Math.min(globalMinX, point.position.x);
        globalMinY = Math.min(globalMinY, point.position.y);
        globalMinZ = Math.min(globalMinZ, point.position.z);
        globalMaxX = Math.max(globalMaxX, point.position.x);
        globalMaxY = Math.max(globalMaxY, point.position.y);
        globalMaxZ = Math.max(globalMaxZ, point.position.z);
      }
    }
  }

  if (allPositions.length === 0) {
    Log.Error('Tools', 'No valid points found');
    return null;
  }

  return {
    pointCloudData: new Float32Array(allPositions),
    globalBounds: {
      minX: globalMinX,
      minY: globalMinY,
      minZ: globalMinZ,
      maxX: globalMaxX,
      maxY: globalMaxY,
      maxZ: globalMaxZ,
    }
  };
}

/**
 * Collect all points from all point clouds in the scene (for smoothing - no bounds needed)
 */
export function collectAllPointsForSmoothing(serviceManager: ServiceManager | null): Float32Array | null {
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
    if (pointCloud && pointCloud.points && pointCloud.points.length > 0) {
      for (const point of pointCloud.points) {
        allPositions.push(point.position.x, point.position.y, point.position.z);
      }
    }
  }

  if (allPositions.length === 0) {
    Log.Error('Tools', 'No valid points found');
    return null;
  }

  return new Float32Array(allPositions);
}

