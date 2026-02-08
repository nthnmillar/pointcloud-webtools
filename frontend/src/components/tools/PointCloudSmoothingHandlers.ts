import { Log } from '../../utils/Log';
import type { ToolHandlers } from './ToolsTypes';
import { collectAllPointsForSmoothing } from './ToolsUtils';

/**
 * Factory function that creates all point cloud smoothing handlers
 * Takes dependencies and returns an object with all handler functions
 */
export function createPointCloudSmoothingHandlers(handlers: ToolHandlers) {
  const {
    serviceManager,
    callbacks,
    smoothingRadius,
    smoothingIterations,
    setIsProcessing,
    isProcessingRef,
    workerManager,
  } = handlers;

  // Shared processing function for most smoothing methods
  const processPointCloudSmoothing = async (
    method:
      | 'TS'
      | 'WASM'
      | 'WASM_CPP_MAIN'
      | 'WASM_RUST'
      | 'BE'
      | 'BE_RUST'
      | 'BE_PYTHON'
  ): Promise<{
    originalCount: number;
    smoothedCount?: number;
    processingTime: number;
    smoothingRadius?: number;
    iterations?: number;
  } | null> => {
    Log.Info('Tools', '=== Starting Point Cloud Smoothing ===', { method });

    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return null;
    }

    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      const pointData = collectAllPointsForSmoothing(serviceManager);
      if (!pointData) return null;

      const pointCloudData = pointData.pointCloudData;
      const pointCount = pointCloudData.length / 3;

      Log.Info('Tools', 'Starting point cloud smoothing', {
        pointCount,
        smoothingRadius,
        iterations: smoothingIterations,
      });

      serviceManager.pointService?.clearAllPointClouds();
      callbacks.onCurrentToolChange?.('smoothing');

      let result;

      if (
        method === 'TS' ||
        method === 'BE' ||
        method === 'BE_RUST' ||
        method === 'BE_PYTHON' ||
        method === 'WASM_CPP_MAIN'
      ) {
        if (method === 'TS') {
          result =
            await serviceManager.toolsService.performPointCloudSmoothingTS({
              points: pointCloudData,
              colors: pointData.colors,
              intensities: pointData.intensities,
              classifications: pointData.classifications,
              smoothingRadius,
              iterations: smoothingIterations,
            });
        } else if (method === 'BE') {
          result =
            await serviceManager.toolsService.performPointCloudSmoothingBECPP({
              points: pointCloudData,
              colors: pointData.colors,
              intensities: pointData.intensities,
              classifications: pointData.classifications,
              smoothingRadius,
              iterations: smoothingIterations,
            });
        } else if (method === 'BE_RUST') {
          result =
            await serviceManager.toolsService.performPointCloudSmoothingBERust({
              points: pointCloudData,
              colors: pointData.colors,
              intensities: pointData.intensities,
              classifications: pointData.classifications,
              smoothingRadius,
              iterations: smoothingIterations,
            });
        } else if (method === 'BE_PYTHON') {
          result =
            await serviceManager.toolsService.performPointCloudSmoothingBEPython(
              {
                points: pointCloudData,
                colors: pointData.colors,
                intensities: pointData.intensities,
                classifications: pointData.classifications,
                smoothingRadius,
                iterations: smoothingIterations,
              }
            );
        } else {
          result =
            await serviceManager.toolsService.performPointCloudSmoothingWASMCPP(
              {
                points: pointCloudData,
                colors: pointData.colors,
                intensities: pointData.intensities,
                classifications: pointData.classifications,
                smoothingRadius,
                iterations: smoothingIterations,
              }
            );
        }
      } else {
        if (method === 'WASM') {
          if (!workerManager.current || !workerManager.current.isReady) {
            Log.Error('Tools', 'Worker manager not available for C++ WASM');
            throw new Error('Worker manager not available for C++ WASM');
          }

          const workerResult =
            await workerManager.current.processPointCloudSmoothing(
              'WASM_CPP',
              pointCloudData,
              smoothingRadius,
              smoothingIterations,
              pointData.colors,
              pointData.intensities,
              pointData.classifications
            );

          if (
            workerResult.type !== 'SUCCESS' ||
            !workerResult.data?.smoothedPoints
          ) {
            throw new Error(
              `WASM C++ point cloud smoothing failed: ${workerResult.error}`
            );
          }

          result = {
            success: true,
            smoothedPoints: workerResult.data.smoothedPoints,
            smoothedColors: workerResult.data.smoothedColors,
            smoothedIntensities: workerResult.data.smoothedIntensities,
            smoothedClassifications: workerResult.data.smoothedClassifications,
            originalCount: workerResult.data.originalCount,
            smoothedCount: workerResult.data.smoothedCount,
            processingTime: workerResult.data.processingTime,
          };
        } else if (method === 'WASM_RUST') {
          if (!workerManager.current || !workerManager.current.isReady) {
            Log.Error('Tools', 'Worker manager not available for Rust WASM');
            throw new Error('Worker manager not available for Rust WASM');
          }

          const workerResult =
            await workerManager.current.processPointCloudSmoothing(
              'WASM_RUST',
              pointCloudData,
              smoothingRadius,
              smoothingIterations,
              pointData.colors,
              pointData.intensities,
              pointData.classifications
            );

          if (
            workerResult.type !== 'SUCCESS' ||
            !workerResult.data?.smoothedPoints
          ) {
            throw new Error(
              `WASM Rust point cloud smoothing failed: ${workerResult.error}`
            );
          }

          result = {
            success: true,
            smoothedPoints: workerResult.data.smoothedPoints,
            smoothedColors: workerResult.data.smoothedColors,
            smoothedIntensities: workerResult.data.smoothedIntensities,
            smoothedClassifications: workerResult.data.smoothedClassifications,
            originalCount: workerResult.data.originalCount,
            smoothedCount: workerResult.data.smoothedCount,
            processingTime: workerResult.data.processingTime,
          };
        } else {
          Log.Error('Tools', `Unknown method: ${method}`);
          return null;
        }
      }

      if (result.success && result.smoothedPoints) {
        const outPointCount = result.smoothedPoints.length / 3;
        const smoothedColors =
          result.smoothedColors != null &&
          result.smoothedColors.length === outPointCount * 3
            ? result.smoothedColors
            : undefined;
        const smoothedIntensities =
          result.smoothedIntensities != null &&
          result.smoothedIntensities.length === outPointCount
            ? result.smoothedIntensities
            : undefined;
        const smoothedClassifications =
          result.smoothedClassifications != null &&
          result.smoothedClassifications.length === outPointCount
            ? result.smoothedClassifications
            : undefined;

        if (
          smoothedColors != null ||
          smoothedIntensities != null ||
          smoothedClassifications != null
        ) {
          const smoothedId = `smoothed_${Date.now()}`;
          await serviceManager.pointService?.createPointCloudMeshFromFloat32Array(
            smoothedId,
            result.smoothedPoints,
            undefined,
            {
              name: 'Smoothed Point Cloud',
              hasColor: smoothedColors != null,
              hasIntensity: smoothedIntensities != null,
              hasClassification: smoothedClassifications != null,
              originalCount: result.originalCount || 0,
              smoothedCount: result.smoothedCount || 0,
              smoothingRadius: smoothingRadius,
              iterations: smoothingIterations,
              processingTime: result.processingTime || 0,
            },
            smoothedColors,
            smoothedIntensities,
            smoothedClassifications
          );
        } else {
          const smoothedPoints = [];
          for (let i = 0; i < outPointCount; i++) {
            const pointIndex = i * 3;
            smoothedPoints.push({
              position: {
                x: result.smoothedPoints[pointIndex],
                y: result.smoothedPoints[pointIndex + 1],
                z: result.smoothedPoints[pointIndex + 2],
              },
              color: { r: 1, g: 1, b: 0 },
              intensity: 1,
              classification: 0,
            });
          }
          const smoothedPointCloud = {
            points: smoothedPoints,
            metadata: {
              name: 'Smoothed Point Cloud',
              totalPoints: smoothedPoints.length,
              bounds: {
                min: {
                  x: Math.min(...smoothedPoints.map(p => p.position.x)),
                  y: Math.min(...smoothedPoints.map(p => p.position.y)),
                  z: Math.min(...smoothedPoints.map(p => p.position.z)),
                },
                max: {
                  x: Math.max(...smoothedPoints.map(p => p.position.x)),
                  y: Math.max(...smoothedPoints.map(p => p.position.y)),
                  z: Math.max(...smoothedPoints.map(p => p.position.z)),
                },
              },
              hasColor: true,
              hasIntensity: true,
              hasClassification: true,
              originalCount: result.originalCount || 0,
              smoothedCount: result.smoothedCount || 0,
              smoothingRadius: smoothingRadius,
              iterations: smoothingIterations,
              processingTime: result.processingTime || 0,
            },
          };
          const smoothedId = `smoothed_${Date.now()}`;
          await serviceManager.pointService?.loadPointCloud(
            smoothedId,
            smoothedPointCloud,
            false
          );
        }

        return {
          originalCount: result.originalCount || 0,
          smoothedCount: result.smoothedCount || 0,
          processingTime: result.processingTime || 0,
          smoothingRadius: smoothingRadius,
          iterations: smoothingIterations,
        };
      } else {
        Log.Error('Tools', 'Point cloud smoothing failed', result.error);
        return null;
      }
    } catch (error) {
      Log.Error('Tools', 'Point cloud smoothing error', error);
      throw error;
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const handleRustWasmMainPointCloudSmoothing = async () => {
    Log.Info(
      'Tools',
      '=== Starting Rust WASM Main Thread Point Cloud Smoothing ==='
    );

    if (!serviceManager?.toolsService) {
      Log.Error('Tools', 'Tools service not available');
      return;
    }

    const startTime = performance.now();
    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      const pointData = collectAllPointsForSmoothing(serviceManager);
      if (!pointData) return;

      const pointCloudData = pointData.pointCloudData;
      Log.Info('Tools', 'Starting Rust WASM Main point cloud smoothing', {
        pointCount: pointCloudData.length / 3,
        smoothingRadius,
        iterations: smoothingIterations,
      });

      serviceManager.pointService?.clearAllPointClouds();
      callbacks.onCurrentToolChange?.('smoothing');

      const result =
        await serviceManager.toolsService.performPointCloudSmoothingRustWasmMain(
          {
            points: pointCloudData,
            colors: pointData.colors,
            intensities: pointData.intensities,
            classifications: pointData.classifications,
            smoothingRadius,
            iterations: smoothingIterations,
          }
        );

      if (result.success && result.smoothedPoints) {
        const outPointCount = result.smoothedPoints.length / 3;
        const smoothedColors =
          result.smoothedColors != null &&
          result.smoothedColors.length === outPointCount * 3
            ? result.smoothedColors
            : undefined;
        const smoothedIntensities =
          result.smoothedIntensities != null &&
          result.smoothedIntensities.length === outPointCount
            ? result.smoothedIntensities
            : undefined;
        const smoothedClassifications =
          result.smoothedClassifications != null &&
          result.smoothedClassifications.length === outPointCount
            ? result.smoothedClassifications
            : undefined;

        if (
          smoothedColors != null ||
          smoothedIntensities != null ||
          smoothedClassifications != null
        ) {
          const rustWasmMainId = `rust_wasm_main_smoothed_${Date.now()}`;
          await serviceManager.pointService?.createPointCloudMeshFromFloat32Array(
            rustWasmMainId,
            result.smoothedPoints,
            undefined,
            {
              name: 'Rust WASM Main Smoothed Point Cloud',
              hasColor: smoothedColors != null,
              hasIntensity: smoothedIntensities != null,
              hasClassification: smoothedClassifications != null,
              originalCount: result.originalCount,
              smoothedCount: result.smoothedCount,
              smoothingRadius: smoothingRadius,
              iterations: smoothingIterations,
              processingTime: result.processingTime || 0,
            },
            smoothedColors,
            smoothedIntensities,
            smoothedClassifications
          );
        } else {
          const smoothedPoints = [];
          for (let i = 0; i < outPointCount; i++) {
            const pointIndex = i * 3;
            smoothedPoints.push({
              position: {
                x: result.smoothedPoints[pointIndex],
                y: result.smoothedPoints[pointIndex + 1],
                z: result.smoothedPoints[pointIndex + 2],
              },
              color: { r: 1, g: 0.4, b: 0.28 },
              intensity: 1,
              classification: 0,
            });
          }
          const rustWasmMainPointCloud = {
            points: smoothedPoints,
            metadata: {
              name: 'Rust WASM Main Smoothed Point Cloud',
              totalPoints: smoothedPoints.length,
              bounds: {
                min: {
                  x: Math.min(...smoothedPoints.map(p => p.position.x)),
                  y: Math.min(...smoothedPoints.map(p => p.position.y)),
                  z: Math.min(...smoothedPoints.map(p => p.position.z)),
                },
                max: {
                  x: Math.max(...smoothedPoints.map(p => p.position.x)),
                  y: Math.max(...smoothedPoints.map(p => p.position.y)),
                  z: Math.max(...smoothedPoints.map(p => p.position.z)),
                },
              },
              hasColor: true,
              hasIntensity: true,
              hasClassification: true,
              originalCount: result.originalCount,
              smoothedCount: result.smoothedCount,
              smoothingRadius: smoothingRadius,
              iterations: smoothingIterations,
              processingTime: result.processingTime || 0,
            },
          };
          const rustWasmMainId = `rust_wasm_main_smoothed_${Date.now()}`;
          await serviceManager.pointService?.loadPointCloud(
            rustWasmMainId,
            rustWasmMainPointCloud,
            false
          );
        }

        const endToEndTime = performance.now() - startTime;
        callbacks.onRustWasmMainResults?.({
          originalCount: result.originalCount || 0,
          smoothedCount: result.smoothedCount || 0,
          processingTime: endToEndTime,
          smoothingRadius: smoothingRadius,
          iterations: smoothingIterations,
        });
      } else {
        Log.Error(
          'Tools',
          'Rust WASM Main point cloud smoothing failed',
          result.error
        );
      }
    } catch (error) {
      Log.Error('Tools', 'Rust WASM Main point cloud smoothing error', error);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const handleWasmPointCloudSmoothing = async () => {
    const startTime = performance.now();
    const results = await processPointCloudSmoothing('WASM');
    const endToEndTime = performance.now() - startTime;

    if (results) {
      callbacks.onWasmResults?.({
        ...results,
        processingTime: endToEndTime,
      });
    }
  };

  const handleWasmCppMainPointCloudSmoothing = async () => {
    const startTime = performance.now();
    const results = await processPointCloudSmoothing('WASM_CPP_MAIN');
    const endToEndTime = performance.now() - startTime;

    if (results) {
      callbacks.onWasmCppMainResults?.({
        ...results,
        processingTime: endToEndTime,
      });
    }
  };

  const handleWasmRustPointCloudSmoothing = async () => {
    const startTime = performance.now();
    const results = await processPointCloudSmoothing('WASM_RUST');
    const endToEndTime = performance.now() - startTime;

    if (results) {
      callbacks.onWasmRustResults?.({
        ...results,
        processingTime: endToEndTime,
      });
    }
  };

  const handleTsPointCloudSmoothing = async () => {
    const startTime = performance.now();
    const results = await processPointCloudSmoothing('TS');
    const endToEndTime = performance.now() - startTime;

    if (results) {
      callbacks.onTsResults?.({
        ...results,
        processingTime: endToEndTime,
      });
    }
  };

  const handleBePointCloudSmoothing = async () => {
    const startTime = performance.now();
    const results = await processPointCloudSmoothing('BE');
    const endToEndTime = performance.now() - startTime;

    if (results) {
      callbacks.onBeResults?.({
        ...results,
        processingTime: endToEndTime,
      });
    }
  };

  const handleBeRustPointCloudSmoothing = async () => {
    const startTime = performance.now();
    const results = await processPointCloudSmoothing('BE_RUST');
    const endToEndTime = performance.now() - startTime;

    if (results) {
      callbacks.onBeRustResults?.({
        ...results,
        processingTime: endToEndTime,
      });
    }
  };

  const handleBePythonPointCloudSmoothing = async () => {
    const startTime = performance.now();
    const results = await processPointCloudSmoothing('BE_PYTHON');
    const endToEndTime = performance.now() - startTime;

    if (results) {
      callbacks.onBePythonResults?.({
        ...results,
        processingTime: endToEndTime,
      });
    }
  };

  return {
    handleRustWasmMainPointCloudSmoothing,
    handleWasmPointCloudSmoothing,
    handleWasmCppMainPointCloudSmoothing,
    handleWasmRustPointCloudSmoothing,
    handleTsPointCloudSmoothing,
    handleBePointCloudSmoothing,
    handleBeRustPointCloudSmoothing,
    handleBePythonPointCloudSmoothing,
  };
}
