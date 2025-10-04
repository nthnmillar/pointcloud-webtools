declare module '*.wasm' {
  const value: any;
  export default value;
}

declare module '*/tools.js' {
  interface Point3D {
    x: number;
    y: number;
    z: number;
  }

  interface ToolsModule {
    voxelDownsample(points: Float32Array, voxelSize: number, minX?: number, minY?: number, minZ?: number): Point3D[];
    showVoxelDebug(points: Float32Array, voxelSize: number): void;
    hideVoxelDebug(): void;
    getVoxelDebugCenters(): Float32Array;
    getVoxelDebugSize(): number;
    isVoxelDebugVisible(): boolean;
  }

  const factory: () => Promise<ToolsModule>;
  export default factory;
}
