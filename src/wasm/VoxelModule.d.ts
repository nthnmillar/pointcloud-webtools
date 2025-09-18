export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface VoxelModule {
  voxelDownsample(inputPoints: Point3D[], voxelSize: number): Point3D[];
}

declare function VoxelModule(options?: {
  locateFile?: (path: string) => string;
}): Promise<VoxelModule>;
export default VoxelModule;
