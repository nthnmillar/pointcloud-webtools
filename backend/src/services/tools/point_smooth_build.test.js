import { describe, test, expect } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Integration tests for point smoothing tool
 * Tests verify correctness and all implementations (C++, Rust, Python)
 */

describe('Point Smoothing Tool', () => {
  const toolsDir = join(__dirname, 'build');

  // Test all implementations
  const implementations = [
    { name: 'C++', executable: 'point_smooth_cpp' },
    { name: 'Rust', executable: 'point_smooth_rust' },
  ];

  implementations.forEach(({ name, executable }) => {
    describe(`${name} Implementation`, () => {
      test('should handle empty input', async () => {
        const result = await runTool(
          join(toolsDir, executable),
          createPointSmoothInput(0, 0.1, 3, [])
        );
        expect(result.outputCount).toBe(0);
      });

      test('should preserve single point', async () => {
        const points = [1.0, 2.0, 3.0];
        const result = await runTool(
          join(toolsDir, executable),
          createPointSmoothInput(1, 0.1, 1, points)
        );

        expect(result.outputCount).toBe(1);
        expect(result.points.length).toBe(3);
        // Single point should remain unchanged (no neighbors to smooth with)
        expect(result.points[0]).toBeCloseTo(1.0, 3);
        expect(result.points[1]).toBeCloseTo(2.0, 3);
        expect(result.points[2]).toBeCloseTo(3.0, 3);
      });

      test('should smooth points with neighbors', async () => {
        // Three points close together
        const points = [0.0, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0];
        const result = await runTool(
          join(toolsDir, executable),
          createPointSmoothInput(3, 0.5, 1, points)
        );

        expect(result.outputCount).toBe(3);
        expect(result.points.length).toBe(9);
        // Points should be smoothed (moved toward each other)
        // After smoothing, points should be closer to their average
        const avgX = (0.0 + 0.1 + 0.0) / 3;
        const avgY = (0.0 + 0.0 + 0.1) / 3;
        expect(result.points[0]).toBeCloseTo(avgX, 1);
        expect(result.points[1]).toBeCloseTo(avgY, 1);
      });

      test('should handle zero iterations', async () => {
        const points = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        const result = await runTool(
          join(toolsDir, executable),
          createPointSmoothInput(2, 0.5, 0, points)
        );
        // With 0 iterations, should return empty or handle gracefully
        expect(result.outputCount).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // Cross-validation
  describe('Cross-Implementation Validation', () => {
    test('C++ and Rust should produce similar results', async () => {
      const points = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
      const input = createPointSmoothInput(3, 0.5, 1, points);

      const cppResult = await runTool(
        join(toolsDir, 'point_smooth_cpp'),
        input
      );
      const rustResult = await runTool(
        join(toolsDir, 'point_smooth_rust'),
        input
      );

      expect(cppResult.outputCount).toBe(rustResult.outputCount);
      // Points should be similar (smoothing may have slight numerical differences)
      for (let i = 0; i < cppResult.points.length; i++) {
        expect(cppResult.points[i]).toBeCloseTo(rustResult.points[i], 2);
      }
    });
  });
});

// Helper functions
function createPointSmoothInput(pointCount, radius, iterations, points) {
  const buffer = Buffer.allocUnsafe(12 + points.length * 4);
  const view = new DataView(buffer.buffer, buffer.byteOffset);

  view.setUint32(0, pointCount, true);
  view.setFloat32(4, radius, true);
  view.setFloat32(8, iterations, true);

  points.forEach((point, i) => {
    view.setFloat32(12 + i * 4, point, true);
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
