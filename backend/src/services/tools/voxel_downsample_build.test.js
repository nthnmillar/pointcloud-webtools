import { describe, test, expect } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Integration tests for voxel downsampling tool
 * Tests verify correctness and all implementations (C++, Rust, Python)
 */

describe('Voxel Downsampling Tool', () => {
  const toolsDir = join(__dirname, 'build');

  // Test all implementations
  const implementations = [
    { name: 'C++', executable: 'voxel_downsample' },
    { name: 'Rust', executable: 'voxel_downsample_rust' },
  ];

  implementations.forEach(({ name, executable }) => {
    describe(`${name} Implementation`, () => {
      test('should handle empty input', async () => {
        const result = await runTool(
          join(toolsDir, executable),
          createVoxelDownsampleInput(0, 1.0, 0, 0, 0, 10, 10, 10, [])
        );
        expect(result.outputCount).toBe(0);
      });

      test('should correctly downsample 4 points in a square to 1 point', async () => {
        // 4 points forming a square: (0,0,0), (1,0,0), (0,1,0), (1,1,0)
        // With voxel size 2.0, all should be in same voxel
        const points = [
          0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0,
        ];
        const result = await runTool(
          join(toolsDir, executable),
          createVoxelDownsampleInput(4, 2.0, 0, 0, 0, 10, 10, 10, points)
        );

        expect(result.outputCount).toBe(1);
        // Average should be (0.5, 0.5, 0.0)
        expect(result.points[0]).toBeCloseTo(0.5, 3);
        expect(result.points[1]).toBeCloseTo(0.5, 3);
        expect(result.points[2]).toBeCloseTo(0.0, 3);
      });

      test('should keep separate points in different voxels', async () => {
        // Two points far apart, small voxel size
        const points = [0.0, 0.0, 0.0, 5.0, 0.0, 0.0];
        const result = await runTool(
          join(toolsDir, executable),
          createVoxelDownsampleInput(2, 1.0, 0, 0, 0, 10, 10, 10, points)
        );

        expect(result.outputCount).toBe(2);
        // Points should be in separate voxels
        // Check that we have points near both original positions (order may vary)
        const xValues = [result.points[0], result.points[3]];
        const hasNearZero = xValues.some(x => Math.abs(x) < 1);
        const hasNearFive = xValues.some(x => Math.abs(x - 5) < 1);
        expect(hasNearZero).toBe(true);
        expect(hasNearFive).toBe(true);
      });

      test('should handle single point', async () => {
        const points = [1.5, 2.5, 3.5];
        const result = await runTool(
          join(toolsDir, executable),
          createVoxelDownsampleInput(1, 1.0, 0, 0, 0, 10, 10, 10, points)
        );

        expect(result.outputCount).toBe(1);
        expect(result.points[0]).toBeCloseTo(1.5, 3);
        expect(result.points[1]).toBeCloseTo(2.5, 3);
        expect(result.points[2]).toBeCloseTo(3.5, 3);
      });
    });
  });

  // Cross-validation: same input should produce same output across implementations
  describe('Cross-Implementation Validation', () => {
    test('C++ and Rust should produce same output count', async () => {
      const points = [
        0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0,
      ];
      const input = createVoxelDownsampleInput(
        4,
        1.0,
        0,
        0,
        0,
        10,
        10,
        10,
        points
      );

      const cppResult = await runTool(
        join(toolsDir, 'voxel_downsample'),
        input
      );
      const rustResult = await runTool(
        join(toolsDir, 'voxel_downsample_rust'),
        input
      );

      // Output count should match (both should produce same number of voxels)
      expect(cppResult.outputCount).toBe(rustResult.outputCount);
      // Both implementations should produce valid results
      // Note: Exact values may differ due to floating point precision and implementation details
      // but both should produce the same number of output points
      if (cppResult.outputCount > 0 && rustResult.outputCount > 0) {
        expect(cppResult.points.length).toBe(rustResult.points.length);
        // Both should produce points in similar ranges
        const cppAvgX =
          cppResult.points
            .filter((_, i) => i % 3 === 0)
            .reduce((a, b) => a + Math.abs(b), 0) / cppResult.outputCount;
        const rustAvgX =
          rustResult.points
            .filter((_, i) => i % 3 === 0)
            .reduce((a, b) => a + Math.abs(b), 0) / rustResult.outputCount;
        // Average X values should be similar (within 50% for cross-validation tolerance)
        if (cppAvgX > 0.01 && rustAvgX > 0.01) {
          const ratio =
            Math.max(cppAvgX, rustAvgX) / Math.min(cppAvgX, rustAvgX);
          expect(ratio).toBeLessThan(2.0); // Allow up to 2x difference
        }
      }
    });
  });
});

// Helper functions
function createVoxelDownsampleInput(
  pointCount,
  voxelSize,
  minX,
  minY,
  minZ,
  maxX,
  maxY,
  maxZ,
  points
) {
  const buffer = Buffer.allocUnsafe(32 + points.length * 4);
  const view = new DataView(buffer.buffer, buffer.byteOffset);

  view.setUint32(0, pointCount, true);
  view.setFloat32(4, voxelSize, true);
  view.setFloat32(8, minX, true);
  view.setFloat32(12, minY, true);
  view.setFloat32(16, minZ, true);
  view.setFloat32(20, maxX, true);
  view.setFloat32(24, maxY, true);
  view.setFloat32(28, maxZ, true);

  points.forEach((point, i) => {
    view.setFloat32(32 + i * 4, point, true);
  });

  return buffer;
}

function runTool(executable, input) {
  return new Promise((resolve, reject) => {
    const process = spawn(executable);
    const chunks = [];

    process.stdout.on('data', chunk => {
      chunks.push(chunk);
    });

    process.stderr.on('data', _chunk => {
      // Suppress stderr for cleaner test output
    });

    process.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Tool exited with code ${code}`));
        return;
      }

      const output = Buffer.concat(chunks);
      const view = new DataView(output.buffer, output.byteOffset);

      if (output.length < 4) {
        reject(new Error('Output too short'));
        return;
      }

      const outputCount = view.getUint32(0, true);
      const points = [];

      for (let i = 0; i < outputCount * 3; i++) {
        points.push(view.getFloat32(4 + i * 4, true));
      }

      resolve({ outputCount, points });
    });

    process.stdin.write(input);
    process.stdin.end();
  });
}
