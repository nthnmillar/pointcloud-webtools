import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { NullEngine, Engine, Scene } from '@babylonjs/core';
import { PointService } from './PointService';
import type { PointCloudData } from './PointCloud';

describe('PointService', () => {
  let nullEngine: NullEngine;
  let engine: Engine | null;
  let scene: Scene | null;
  let pointService: PointService;

  beforeEach(async () => {
    nullEngine = new NullEngine();
    engine = nullEngine;
    scene = new Scene(engine);
    pointService = new PointService();
    await pointService.initialize(scene);
  });

  afterEach(() => {
    pointService.dispose();
    scene?.dispose();
    nullEngine.dispose();
  });

  test('should initialize successfully', () => {
    expect(pointService.initialized).toBe(true);
    expect(pointService.pointMeshInstance).not.toBeNull();
  });

  test('should load point cloud data', async () => {
    const pointCloudData: PointCloudData = {
      points: [
        {
          position: { x: 0, y: 0, z: 0 },
          color: { r: 1, g: 0, b: 0 },
          intensity: 1,
          classification: 0,
        },
        {
          position: { x: 1, y: 0, z: 0 },
          color: { r: 0, g: 1, b: 0 },
          intensity: 1,
          classification: 1,
        },
      ],
      metadata: {
        name: 'Test Cloud',
        totalPoints: 2,
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 1, y: 0, z: 0 },
        },
        hasColor: true,
        hasIntensity: true,
        hasClassification: true,
        coordinateSystem: 'local',
        units: 'meters',
        created: new Date(),
      },
    };

    await pointService.loadPointCloud('test-id', pointCloudData, false);

    expect(pointService.getPointCloud('test-id')).toBeDefined();
    expect(pointService.activePointCloudId).toBe('test-id');
  });

  test('should generate sample point cloud', () => {
    const sampleData = pointService.generateSamplePointCloud('sample-id', 10);

    expect(sampleData.points.length).toBeGreaterThanOrEqual(10);
    expect(sampleData.metadata.name).toContain('Sample Point Cloud');
    expect(sampleData.metadata.totalPoints).toBe(10);
  });

  test('should calculate bounds correctly', () => {
    const pointCloudData: PointCloudData = {
      points: [
        {
          position: { x: 0, y: 0, z: 0 },
          color: { r: 1, g: 0, b: 0 },
          intensity: 1,
          classification: 0,
        },
        {
          position: { x: 5, y: 5, z: 5 },
          color: { r: 0, g: 1, b: 0 },
          intensity: 1,
          classification: 1,
        },
      ],
      metadata: {
        name: 'Test',
        totalPoints: 2,
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 5, y: 5, z: 5 },
        },
        hasColor: true,
        hasIntensity: true,
        hasClassification: true,
        coordinateSystem: 'local',
        units: 'meters',
        created: new Date(),
      },
    };

    const bounds = pointService.calculateBounds(pointCloudData.points);

    expect(bounds.min.x).toBe(0);
    expect(bounds.min.y).toBe(0);
    expect(bounds.min.z).toBe(0);
    expect(bounds.max.x).toBe(5);
    expect(bounds.max.y).toBe(5);
    expect(bounds.max.z).toBe(5);
  });

  test('should set and get active point cloud', async () => {
    const pointCloudData: PointCloudData = {
      points: [
        {
          position: { x: 0, y: 0, z: 0 },
          color: { r: 1, g: 0, b: 0 },
          intensity: 1,
          classification: 0,
        },
      ],
      metadata: {
        name: 'Test',
        totalPoints: 1,
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 0, y: 0, z: 0 },
        },
        hasColor: true,
        hasIntensity: true,
        hasClassification: true,
        coordinateSystem: 'local',
        units: 'meters',
        created: new Date(),
      },
    };

    await pointService.loadPointCloud('cloud-1', pointCloudData, false);
    await pointService.loadPointCloud('cloud-2', pointCloudData, false);

    pointService.activePointCloudId = 'cloud-2';
    expect(pointService.activePointCloudId).toBe('cloud-2');
  });

  test('should remove point cloud', async () => {
    const pointCloudData: PointCloudData = {
      points: [
        {
          position: { x: 0, y: 0, z: 0 },
          color: { r: 1, g: 0, b: 0 },
          intensity: 1,
          classification: 0,
        },
      ],
      metadata: {
        name: 'Test',
        totalPoints: 1,
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 0, y: 0, z: 0 },
        },
        hasColor: true,
        hasIntensity: true,
        hasClassification: true,
        coordinateSystem: 'local',
        units: 'meters',
        created: new Date(),
      },
    };

    await pointService.loadPointCloud('test-id', pointCloudData, false);
    expect(pointService.getPointCloud('test-id')).toBeDefined();

    pointService.removePointCloud('test-id');
    expect(pointService.getPointCloud('test-id')).toBeUndefined();
  });

  test('should clear all point clouds', async () => {
    const pointCloudData: PointCloudData = {
      points: [
        {
          position: { x: 0, y: 0, z: 0 },
          color: { r: 1, g: 0, b: 0 },
          intensity: 1,
          classification: 0,
        },
      ],
      metadata: {
        name: 'Test',
        totalPoints: 1,
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 0, y: 0, z: 0 },
        },
        hasColor: true,
        hasIntensity: true,
        hasClassification: true,
        coordinateSystem: 'local',
        units: 'meters',
        created: new Date(),
      },
    };

    await pointService.loadPointCloud('cloud-1', pointCloudData, false);
    await pointService.loadPointCloud('cloud-2', pointCloudData, false);

    expect(pointService.pointCloudIds.length).toBe(2);

    pointService.clearAllPointClouds();

    expect(pointService.pointCloudIds.length).toBe(0);
    expect(pointService.activePointCloudId).toBeNull();
  });

  test('should create point cloud mesh from Float32Array', async () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const color = { r: 1, g: 0, b: 0 };

    await pointService.createPointCloudMeshFromFloat32Array(
      'test-id',
      positions,
      color,
      { name: 'Test Cloud' }
    );

    expect(pointService.getPointCloud('test-id')).toBeDefined();
    expect(pointService.activePointCloudId).toBe('test-id');
  });

  test('should set batch size', () => {
    pointService.setBatchSize(10000);
    expect(pointService.batchSize).toBe(10000);

    pointService.setBatchSize(50);
    expect(pointService.batchSize).toBe(100);

    pointService.setBatchSize(60000);
    expect(pointService.batchSize).toBe(50000);
  });
});
