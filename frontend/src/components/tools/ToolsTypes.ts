import type { RefObject } from 'react';
import type { WorkerManager } from '../../services/tools/WorkerManager';
import { ServiceManager } from '../../services/ServiceManager';

export interface BenchmarkResult {
  originalCount: number;
  downsampledCount?: number;
  smoothedCount?: number;
  processingTime: number;
  reductionRatio?: number;
  voxelCount?: number;
  smoothingRadius?: number;
  iterations?: number;
}

export interface ToolCallbacks {
  onWasmResults?: (results: BenchmarkResult) => void;
  onWasmCppMainResults?: (results: BenchmarkResult) => void;
  onTsResults?: (results: BenchmarkResult) => void;
  onBeResults?: (results: BenchmarkResult) => void;
  onWasmRustResults?: (results: BenchmarkResult) => void;
  onBeRustResults?: (results: BenchmarkResult) => void;
  onBePythonResults?: (results: BenchmarkResult) => void;
  onRustWasmMainResults?: (results: BenchmarkResult) => void;
  onCurrentToolChange?: (tool: 'voxel' | 'smoothing') => void;
}

export interface ToolHandlers {
  serviceManager: ServiceManager | null;
  callbacks: ToolCallbacks;
  voxelSize: number;
  debugVoxelSize: number;
  smoothingRadius: number;
  smoothingIterations: number;
  showVoxelDebug: boolean;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  setShowVoxelDebug: (value: boolean) => void;
  setDebugVoxelSize: (value: number) => void;
  isProcessingRef: RefObject<boolean>;
  workerManager: RefObject<WorkerManager | null>;
}

