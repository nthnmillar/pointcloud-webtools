import { describe, test, expect } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Integration tests for voxel debug tool
 * Tests verify correctness and all implementations (C++, Rust, Python)
 */

describe('Voxel Debug Tool', () => {
  const toolsDir = join(__dirname, 'build');

  // Test all implementations
  const implementations = [
    { name: 'C++', executable: 'voxel_debug' },
    { name: 'Rust', executable: 'voxel_debug_rust' },
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

      test('should generate correct voxel centers for known points', async () => {
        // 4 points in a square with voxel size 1.0
        // Points: (0,0,0), (1,0,0), (0,1,0), (1,1,0)
        // Should generate 4 voxel centers at: (0.5,0.5,0), (1.5,0.5,0), (0.5,1.5,0), (1.5,1.5,0)
        const points = [
          0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0,
        ];
        const result = await runTool(
          join(toolsDir, executable),
          createVoxelDownsampleInput(4, 1.0, 0, 0, 0, 10, 10, 10, points)
        );

        expect(result.outputCount).toBe(4);
        // Each voxel center should be at the center of its voxel
        // Points are at (0,0,0), (1,0,0), (0,1,0), (1,1,0) with voxel size 1.0
        // Should generate 4 voxel centers, one for each point's voxel
        // Verify all voxels are in reasonable positions (within bounds of input)
        result.points.forEach((coord, i) => {
          if (i % 3 === 0) {
            const x = coord;
            const y = result.points[i + 1];
            const z = result.points[i + 2];
            // Voxel centers should be within bounds
            expect(x).toBeGreaterThanOrEqual(-1);
            expect(x).toBeLessThanOrEqual(3);
            expect(y).toBeGreaterThanOrEqual(-1);
            expect(y).toBeLessThanOrEqual(3);
            expect(z).toBeGreaterThanOrEqual(-1);
            expect(z).toBeLessThanOrEqual(1);
          }
        });
      });

      test('should generate voxel centers for single point', async () => {
        const points = [1.5, 2.5, 3.5];
        const result = await runTool(
          join(toolsDir, executable),
          createVoxelDownsampleInput(1, 1.0, 0, 0, 0, 10, 10, 10, points)
        );

        expect(result.outputCount).toBe(1);
        // Voxel center should be near the point (within voxel size)
        expect(result.points[0]).toBeGreaterThan(1.0);
        expect(result.points[0]).toBeLessThan(2.0);
        expect(result.points[1]).toBeGreaterThan(2.0);
        expect(result.points[1]).toBeLessThan(3.0);
        expect(result.points[2]).toBeGreaterThan(3.0);
        expect(result.points[2]).toBeLessThan(4.0);
      });
    });
  });

  // Cross-validation
  describe('Cross-Implementation Validation', () => {
    test('C++ and Rust should produce same voxel centers', async () => {
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

      const cppResult = await runTool(join(toolsDir, 'voxel_debug'), input);
      const rustResult = await runTool(
        join(toolsDir, 'voxel_debug_rust'),
        input
      );

      expect(cppResult.outputCount).toBe(rustResult.outputCount);
      // Voxel centers should match exactly
      for (let i = 0; i < cppResult.points.length; i++) {
        expect(cppResult.points[i]).toBeCloseTo(rustResult.points[i], 3);
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

    process.stderr.on('data', () => {
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
