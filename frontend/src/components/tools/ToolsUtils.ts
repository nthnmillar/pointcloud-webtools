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
    Log.Debug('Tools', 'Checking point cloud', {
      id: pointCloudId,
      exists: !!pointCloud,
      hasPoints: !!pointCloud?.points,
      pointCount: pointCloud?.points?.length || 0,
      hasPositions: !!pointCloud?.positions,
      positionsLength: pointCloud?.positions?.length || 0,
      pointCloudKeys: pointCloud ? Object.keys(pointCloud) : []
    });
    
    if (pointCloud) {
      // Check if we have positions array (for point clouds created from Float32Array)
      if (pointCloud.positions && pointCloud.positions.length > 0) {
        Log.Debug('Tools', 'Processing points from positions array', {
          id: pointCloudId,
          pointCount: pointCloud.positions.length / 3
        });
        const positions = pointCloud.positions;
        for (let i = 0; i < positions.length; i += 3) {
          const x = positions[i];
          const y = positions[i + 1];
          const z = positions[i + 2];
          allPositions.push(x, y, z);
          
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
          pointCount: pointCloud.points.length
        });
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
      } else {
        Log.Warn('Tools', 'Point cloud has no valid points or positions', {
          id: pointCloudId,
          pointCloud: pointCloud ? 'exists' : 'null',
          hasPoints: !!pointCloud?.points,
          pointCount: pointCloud?.points?.length || 0,
          hasPositions: !!pointCloud?.positions,
          positionsLength: pointCloud?.positions?.length || 0
        });
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
    if (pointCloud) {
      // Check if we have positions array (for point clouds created from Float32Array)
      if (pointCloud.positions && pointCloud.positions.length > 0) {
        const positions = pointCloud.positions;
        for (let i = 0; i < positions.length; i += 3) {
          allPositions.push(positions[i], positions[i + 1], positions[i + 2]);
        }
      } else if (pointCloud.points && pointCloud.points.length > 0) {
        for (const point of pointCloud.points) {
          allPositions.push(point.position.x, point.position.y, point.position.z);
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

