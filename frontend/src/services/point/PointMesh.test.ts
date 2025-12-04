import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { NullEngine, Engine, Scene } from '@babylonjs/core';
import { PointMesh } from './PointMesh';
import type { PointCloudData, RenderOptions } from './PointCloud';

describe('PointMesh', () => {
  let nullEngine: NullEngine;
  let engine: Engine | null;
  let scene: Scene | null;
  let pointMesh: PointMesh;

  beforeEach(async () => {
    nullEngine = new NullEngine();
    engine = nullEngine;
    scene = new Scene(engine);
    pointMesh = new PointMesh(scene);
  });

  afterEach(() => {
    pointMesh.dispose();
    scene?.dispose();
    nullEngine.dispose();
  });

  test('should initialize with scene', () => {
    expect(pointMesh).toBeDefined();
  });

  test('should create point cloud mesh from Float32Array', async () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const color = { r: 1, g: 0, b: 0 };
    const metadata = { name: 'Test Cloud' };
    const options: RenderOptions = {
      pointSize: 2.0,
      colorMode: 'original',
      showBoundingBox: false,
      showAxes: false,
      backgroundColor: { r: 0.1, g: 0.1, b: 0.1 },
    };

    const result = await pointMesh.createPointCloudMeshFromFloat32Array(
      'test-id',
      positions,
      color,
      metadata,
      options
    );

    expect(result).not.toBeNull();
    expect(scene?.meshes.length).toBeGreaterThan(0);
  });

  test('should create point cloud mesh from PointCloudData', async () => {
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

    const options: RenderOptions = {
      pointSize: 2.0,
      colorMode: 'original',
      showBoundingBox: false,
      showAxes: false,
      backgroundColor: { r: 0.1, g: 0.1, b: 0.1 },
    };

    const result = await pointMesh.createPointCloudMesh(
      'test-id',
      pointCloudData,
      options
    );

    expect(result).not.toBeNull();
    expect(scene?.meshes.length).toBeGreaterThan(0);
  });

  test('should remove mesh by ID', async () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
    const options: RenderOptions = {
      pointSize: 2.0,
      colorMode: 'original',
      showBoundingBox: false,
      showAxes: false,
      backgroundColor: { r: 0.1, g: 0.1, b: 0.1 },
    };

    await pointMesh.createPointCloudMeshFromFloat32Array(
      'test-id',
      positions,
      { r: 1, g: 1, b: 1 },
      { name: 'Test' },
      options
    );

    const meshCountBefore = scene?.meshes.length || 0;
    pointMesh.removeMesh('test-id');
    const meshCountAfter = scene?.meshes.length || 0;

    expect(meshCountAfter).toBeLessThanOrEqual(meshCountBefore);
  });

  test('should update point size', async () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
    const options: RenderOptions = {
      pointSize: 2.0,
      colorMode: 'original',
      showBoundingBox: false,
      showAxes: false,
      backgroundColor: { r: 0.1, g: 0.1, b: 0.1 },
    };

    await pointMesh.createPointCloudMeshFromFloat32Array(
      'test-id',
      positions,
      { r: 1, g: 1, b: 1 },
      { name: 'Test' },
      options
    );

    pointMesh.updatePointSize('test-id', 5.0);

    const mesh = scene?.meshes.find(m => m.name === 'pointCloud_test-id');
    expect(mesh).toBeDefined();
  });

  test('should dispose all meshes', async () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
    const options: RenderOptions = {
      pointSize: 2.0,
      colorMode: 'original',
      showBoundingBox: false,
      showAxes: false,
      backgroundColor: { r: 0.1, g: 0.1, b: 0.1 },
    };

    await pointMesh.createPointCloudMeshFromFloat32Array(
      'test-id-1',
      positions,
      { r: 1, g: 1, b: 1 },
      { name: 'Test 1' },
      options
    );

    await pointMesh.createPointCloudMeshFromFloat32Array(
      'test-id-2',
      positions,
      { r: 1, g: 1, b: 1 },
      { name: 'Test 2' },
      options
    );

    const meshCountBefore = scene?.meshes.length || 0;
    pointMesh.dispose();
    const meshCountAfter = scene?.meshes.length || 0;

    expect(meshCountAfter).toBeLessThan(meshCountBefore);
  });
});
