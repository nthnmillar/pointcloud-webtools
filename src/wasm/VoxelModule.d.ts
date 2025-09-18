export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface VoxelModule {
  voxelDownsample(inputPoints: Float32Array, voxelSize: number): any;
}

declare function VoxelModule(options?: {
  locateFile?: (path: string) => string;
}): Promise<VoxelModule>;
export default VoxelModule;
