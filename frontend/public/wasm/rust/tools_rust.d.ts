/* tslint:disable */
/* eslint-disable */
export class PointCloudToolsRust {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  /**
   * Voxel downsampling implementation in Rust
   * This matches the algorithm used in TS, WASM C++, and BE C++
   */
  voxel_downsample(points: Float32Array, voxel_size: number, min_x: number, min_y: number, min_z: number): Float32Array;
  /**
   * Point cloud smoothing implementation in Rust
   * This matches the algorithm used in TS, WASM C++, and BE C++
   */
  point_cloud_smooth(points: Float32Array, smoothing_radius: number, iterations: number): Float32Array;
  /**
   * Generate voxel centers for debug visualization
   * This matches the algorithm used in other implementations
   */
  generate_voxel_centers(points: Float32Array, voxel_size: number, min_x: number, min_y: number, min_z: number): Float32Array;
}
export class Voxel {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_voxel_free: (a: number, b: number) => void;
  readonly __wbg_pointcloudtoolsrust_free: (a: number, b: number) => void;
  readonly pointcloudtoolsrust_new: () => number;
  readonly pointcloudtoolsrust_voxel_downsample: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly pointcloudtoolsrust_point_cloud_smooth: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly pointcloudtoolsrust_generate_voxel_centers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export_0: (a: number, b: number) => number;
  readonly __wbindgen_export_1: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
