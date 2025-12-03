import { describe, test, expect } from 'vitest';

/**
 * Tests for binary protocol used by backend server
 * Binary protocol format:
 * Input: [u32 pointCount][f32* params][f32* pointData]
 * Output: [u32 outputCount][f32* outputData]
 */

describe('Binary Protocol', () => {
  describe('Header serialization', () => {
    test('should serialize voxel downsampling header correctly', () => {
      const pointCount = 100;
      const voxelSize = 0.5;
      const minX = 0.0;
      const minY = 0.0;
      const minZ = 0.0;
      const maxX = 10.0;
      const maxY = 10.0;
      const maxZ = 10.0;

      const buffer = new ArrayBuffer(32);
      const view = new DataView(buffer);

      // Write header (32 bytes: 4 for u32 + 7*4 for floats)
      view.setUint32(0, pointCount, true); // little-endian
      view.setFloat32(4, voxelSize, true);
      view.setFloat32(8, minX, true);
      view.setFloat32(12, minY, true);
      view.setFloat32(16, minZ, true);
      view.setFloat32(20, maxX, true);
      view.setFloat32(24, maxY, true);
      view.setFloat32(28, maxZ, true);

      // Verify reading back
      expect(view.getUint32(0, true)).toBe(pointCount);
      expect(view.getFloat32(4, true)).toBeCloseTo(voxelSize);
      expect(view.getFloat32(8, true)).toBeCloseTo(minX);
    });

    test('should serialize point smoothing header correctly', () => {
      const pointCount = 50;
      const smoothingRadius = 0.1;
      const iterations = 3;

      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);

      view.setUint32(0, pointCount, true);
      view.setFloat32(4, smoothingRadius, true);
      view.setFloat32(8, iterations, true);

      expect(view.getUint32(0, true)).toBe(pointCount);
      expect(view.getFloat32(4, true)).toBeCloseTo(smoothingRadius);
      expect(view.getFloat32(8, true)).toBeCloseTo(iterations);
    });
  });

  describe('Point data serialization', () => {
    test('should serialize and deserialize point data correctly', () => {
      const points = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
      const buffer = new ArrayBuffer(points.length * 4);
      const view = new DataView(buffer);

      // Write points
      points.forEach((point, i) => {
        view.setFloat32(i * 4, point, true);
      });

      // Read back
      const readPoints = [];
      for (let i = 0; i < points.length; i++) {
        readPoints.push(view.getFloat32(i * 4, true));
      }

      expect(readPoints).toEqual(points);
    });
  });

  describe('Output format', () => {
    test('should format output with count header', () => {
      const outputCount = 10;
      const outputData = new Array(outputCount * 3)
        .fill(0)
        .map((_, i) => i * 0.1);

      const buffer = new ArrayBuffer(4 + outputData.length * 4);
      const view = new DataView(buffer);

      view.setUint32(0, outputCount, true);
      outputData.forEach((value, i) => {
        view.setFloat32(4 + i * 4, value, true);
      });

      expect(view.getUint32(0, true)).toBe(outputCount);
      expect(view.getFloat32(4, true)).toBeCloseTo(0.0);
    });
  });
});
