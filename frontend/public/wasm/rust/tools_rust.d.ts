/* tslint:disable */
/* eslint-disable */
export class PointCloudToolsRust {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  /**
   * Get WASM memory for direct access
   */
  get_memory(): any;
  /**
   * Direct pointer-based voxel downsampling for zero-copy input access
   * JavaScript allocates memory, copies input data, calls this function,
   * then reads results from output buffer
   * 
   * Pointers are passed as usize (byte offsets into WASM linear memory)
   * 
   * # Safety
   * This function uses `unsafe` Rust code to access memory directly via raw pointers.
   * Rust cannot automatically verify that these pointers are valid, so we must ensure safety manually.
   * The function validates inputs (alignment, point count, etc.), but the caller (JavaScript) must guarantee:
   * - input_ptr points to valid WASM memory with at least point_count * 3 floats
   * - output_ptr points to valid WASM memory with at least point_count * 3 floats
   * - Both pointers are properly aligned (4-byte boundaries for floats)
   * 
   * When used correctly, this function is safe. The `unsafe` keyword is required because
   * Rust's compiler cannot automatically verify memory safety with raw pointers.
   */
  static voxel_downsample_direct_static(input_ptr: number, point_count: number, voxel_size: number, min_x: number, min_y: number, min_z: number, output_ptr: number): number;
  /**
   * Direct pointer-based voxel downsampling with optional colors, intensity, classification.
   * Pass 0 for any input or output pointer to skip that attribute.
   */
  static voxel_downsample_direct_with_attributes_static(input_ptr: number, input_color_ptr: number, input_intensity_ptr: number, input_class_ptr: number, point_count: number, voxel_size: number, min_x: number, min_y: number, min_z: number, output_ptr: number, output_color_ptr: number, output_intensity_ptr: number, output_class_ptr: number): number;
  /**
   * Point cloud smoothing implementation in Rust
   * This matches the algorithm used in TS, WASM C++, and BE C++
   */
  point_cloud_smooth(points: Float32Array, smoothing_radius: number, iterations: number): Float32Array;
  /**
   * Generate voxel centers for debug visualization
   * Returns unique voxel center positions for rendering wireframe cubes
   */
  generate_voxel_centers(points: Float32Array, voxel_size: number, min_x: number, min_y: number, min_z: number): Float32Array;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_pointcloudtoolsrust_free: (a: number, b: number) => void;
  readonly pointcloudtoolsrust_new: () => number;
  readonly pointcloudtoolsrust_get_memory: (a: number) => number;
  readonly pointcloudtoolsrust_voxel_downsample_direct_static: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
  readonly pointcloudtoolsrust_voxel_downsample_direct_with_attributes_static: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => number;
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
