// TypeScript definitions for COPC WASM module

export interface Point3D {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  intensity: number;
  classification: number;
}

export interface COPCHeader {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  pointCount: number;
  hasColor: boolean;
  hasIntensity: boolean;
  hasClassification: boolean;
}

export interface COPCLoader {
  loadFromArrayBuffer(arrayBuffer: ArrayBuffer): boolean;
  getPointsInBounds(minX: number, minY: number, minZ: number, 
                   maxX: number, maxY: number, maxZ: number): Point3D[];
  getAllPoints(): Point3D[];
  getHeader(): COPCHeader;
  loaded(): boolean;
  getPointCount(): number;
  getBounds(): number[];
  clear(): void;
}

export interface COPCModule {
  COPCLoader: new () => COPCLoader;
  Point3D: new (x: number, y: number, z: number, r: number, g: number, b: number, intensity: number, classification: number) => Point3D;
  COPCHeader: new () => COPCHeader;
}

declare const Module: COPCModule;
export default Module;
