declare module '*/public/wasm/rust/tools_rust.js' {
  export default function init(wasmPath?: string): Promise<unknown>;
  export class PointCloudToolsRust {
    constructor();
    voxel_downsample(
      points: Float64Array,
      voxelSize: number,
      minX: number,
      minY: number,
      minZ: number
    ): Float64Array;
    point_cloud_smooth(
      points: Float64Array,
      radius: number,
      iterations: number
    ): Float64Array;
    generate_voxel_centers(
      points: Float64Array,
      voxelSize: number,
      minX: number,
      minY: number,
      minZ: number
    ): Float64Array;
  }
}
