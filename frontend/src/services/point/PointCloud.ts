/**
 * Point Cloud Data Types and Interfaces
 */

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

export interface ColorRGBA extends ColorRGB {
  a: number;
}

export interface PointCloudPoint {
  position: Point3D;
  color?: ColorRGB | ColorRGBA;
  intensity?: number;
  classification?: number;
  timestamp?: number;
}

export interface PointCloudMetadata {
  name: string;
  description?: string;
  totalPoints: number;
  bounds: {
    min: Point3D;
    max: Point3D;
  };
  hasColor: boolean;
  hasIntensity: boolean;
  hasClassification: boolean;
  coordinateSystem?: string;
  units?: string;
  created?: Date;
  modified?: Date;
  centroid?: Point3D; // Optional centroid for efficient centering
}

export interface PointCloudData {
  points: PointCloudPoint[];
  metadata: PointCloudMetadata;
}

export interface RenderOptions {
  pointSize: number;
  colorMode: 'original' | 'intensity' | 'classification' | 'height';
  showBoundingBox: boolean;
  showAxes: boolean;
  backgroundColor: ColorRGB;
}

export interface CameraSettings {
  position: Point3D;
  target: Point3D;
  fov: number;
  near: number;
  far: number;
}

export interface FilterOptions {
  bounds?: {
    min: Point3D;
    max: Point3D;
  };
  intensityRange?: {
    min: number;
    max: number;
  };
  classificationFilter?: number[];
  colorFilter?: {
    r: { min: number; max: number };
    g: { min: number; max: number };
    b: { min: number; max: number };
  };
}

export type PointCloudEventType =
  | 'loaded'
  | 'loading'
  | 'error'
  | 'selectionChanged'
  | 'cameraChanged'
  | 'renderOptionsChanged';

export interface PointCloudEvent {
  type: PointCloudEventType;
  data?: any;
  timestamp: Date;
}
