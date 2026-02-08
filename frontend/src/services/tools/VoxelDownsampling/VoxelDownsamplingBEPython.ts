import { Log } from '../../../utils/Log';
import { BaseService } from '../../BaseService';
import { BACKEND_WS_URL } from '../../../config';

export interface VoxelDownsamplingBEPythonParams {
  pointCloudData: Float32Array;
  colors?: Float32Array;
  intensities?: Float32Array;
  classifications?: Uint8Array;
  voxelSize: number;
  globalBounds: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  };
}

export interface VoxelDownsamplingBEPythonResult {
  success: boolean;
  downsampledPoints: Float32Array;
  downsampledColors?: Float32Array;
  downsampledIntensities?: Float32Array;
  downsampledClassifications?: Uint8Array;
  originalCount: number;
  downsampledCount: number;
  processingTime: number;
  voxelSize: number;
  voxelCount: number;
}

interface VoxelDownsamplePythonResponseHeader {
  type: 'voxel_downsample_python_result';
  requestId: string;
  success: boolean;
  originalCount: number;
  downsampledCount: number;
  voxelCount: number;
  processingTime: number;
  dataLength: number;
  colorsLength?: number;
  intensitiesLength?: number;
  classificationsLength?: number;
  voxelSize?: number;
  error?: string;
}

export class VoxelDownsamplingBEPython extends BaseService {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: VoxelDownsamplingBEPythonResult) => void;
      reject: (reason?: unknown) => void;
    }
  >();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingHeader: VoxelDownsamplePythonResponseHeader | null = null; // Track pending binary data header

  constructor() {
    super();
    this.connect();
  }

  async initialize(): Promise<void> {
    // Initialize if needed
  }

  public dispose(): void {
    this.destroy();
  }

  private connect(): void {
    try {
      Log.Info('VoxelDownsamplingBEPython', 'Connecting to WebSocket', {
        baseUrl: BACKEND_WS_URL,
      });

      this.ws = new WebSocket(BACKEND_WS_URL);

      this.ws.onopen = () => {
        Log.Info('VoxelDownsamplingBEPython', 'WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = async event => {
        try {
          // Check if this is binary data or JSON header
          if (event.data instanceof ArrayBuffer) {
            if (
              this.pendingHeader &&
              this.pendingHeader.type === 'voxel_downsample_python_result' &&
              this.pendingHeader.success
            ) {
              const h = this.pendingHeader;
              const buf = event.data;
              const posLen = h.dataLength;
              const posBytes = posLen * 4;
              const downsampledPoints = new Float32Array(buf, 0, posLen);
              let offset = posBytes;
              const colorsLength = h.colorsLength ?? 0;
              const intensitiesLength = h.intensitiesLength ?? 0;
              const classificationsLength = h.classificationsLength ?? 0;
              const downsampledColors =
                colorsLength > 0
                  ? new Float32Array(buf, offset, colorsLength)
                  : undefined;
              offset += colorsLength * 4;
              const downsampledIntensities =
                intensitiesLength > 0
                  ? new Float32Array(buf, offset, intensitiesLength)
                  : undefined;
              offset += intensitiesLength * 4;
              const downsampledClassifications =
                classificationsLength > 0
                  ? new Uint8Array(buf, offset, classificationsLength)
                  : undefined;

              const pending = this.pendingRequests.get(h.requestId);
              if (pending) {
                this.pendingRequests.delete(h.requestId);
                pending.resolve({
                  success: true,
                  downsampledPoints,
                  downsampledColors,
                  downsampledIntensities,
                  downsampledClassifications,
                  originalCount: h.originalCount,
                  downsampledCount: h.downsampledCount,
                  processingTime: h.processingTime,
                  voxelSize: h.voxelSize ?? 0,
                  voxelCount: h.voxelCount,
                });
              }
              this.pendingHeader = null;
            }
          } else if (event.data instanceof Blob) {
            const arrayBuffer = await event.data.arrayBuffer();
            if (
              this.pendingHeader &&
              this.pendingHeader.type === 'voxel_downsample_python_result' &&
              this.pendingHeader.success
            ) {
              const h = this.pendingHeader;
              const posLen = h.dataLength;
              const posBytes = posLen * 4;
              const downsampledPoints = new Float32Array(
                arrayBuffer,
                0,
                posLen
              );
              let offset = posBytes;
              const colorsLength = h.colorsLength ?? 0;
              const intensitiesLength = h.intensitiesLength ?? 0;
              const classificationsLength = h.classificationsLength ?? 0;
              const downsampledColors =
                colorsLength > 0
                  ? new Float32Array(arrayBuffer, offset, colorsLength)
                  : undefined;
              offset += colorsLength * 4;
              const downsampledIntensities =
                intensitiesLength > 0
                  ? new Float32Array(arrayBuffer, offset, intensitiesLength)
                  : undefined;
              offset += intensitiesLength * 4;
              const downsampledClassifications =
                classificationsLength > 0
                  ? new Uint8Array(arrayBuffer, offset, classificationsLength)
                  : undefined;

              const pending = this.pendingRequests.get(h.requestId);
              if (pending) {
                this.pendingRequests.delete(h.requestId);
                pending.resolve({
                  success: true,
                  downsampledPoints,
                  downsampledColors,
                  downsampledIntensities,
                  downsampledClassifications,
                  originalCount: h.originalCount,
                  downsampledCount: h.downsampledCount,
                  processingTime: h.processingTime,
                  voxelSize: h.voxelSize ?? 0,
                  voxelCount: h.voxelCount,
                });
              }
              this.pendingHeader = null;
            }
          } else {
            // This is JSON header
            const message = JSON.parse(event.data as string);

            if (message.type === 'voxel_downsample_python_result') {
              if (message.success && message.dataLength) {
                // Store header and wait for binary data
                this.pendingHeader = message;
              } else {
                // Error response (no binary data)
                const { requestId, error } = message;
                const pending = this.pendingRequests.get(requestId);
                if (pending) {
                  this.pendingRequests.delete(requestId);
                  pending.reject(
                    new Error(error || 'Voxel downsampling failed')
                  );
                }
              }
            }
          }
        } catch (error) {
          Log.Error(
            'VoxelDownsamplingBEPython',
            'Error parsing WebSocket message',
            error
          );
        }
      };

      this.ws.onclose = () => {
        Log.Info('VoxelDownsamplingBEPython', 'WebSocket disconnected');
        this.ws = null;

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Log.Info(
            'VoxelDownsamplingBEPython',
            `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
          );
          setTimeout(() => this.connect(), this.reconnectDelay);
        }
      };

      this.ws.onerror = error => {
        Log.Error('VoxelDownsamplingBEPython', 'WebSocket error', error);
      };
    } catch (error) {
      Log.Error(
        'VoxelDownsamplingBEPython',
        'Failed to connect WebSocket',
        error
      );
    }
  }

  public async performVoxelDownsampling(
    params: VoxelDownsamplingBEPythonParams
  ): Promise<VoxelDownsamplingBEPythonResult> {
    Log.Info(
      'VoxelDownsamplingBEPython',
      'Starting voxel downsampling via WebSocket',
      {
        pointCount: params.pointCloudData.length / 3,
        voxelSize: params.voxelSize,
      }
    );

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = `voxel_downsample_python_${Date.now()}_${Math.random()}`;

      this.pendingRequests.set(requestId, { resolve, reject });

      const hasColors =
        params.colors != null && params.colors.length === params.pointCloudData.length;
      const hasIntensity =
        params.intensities != null &&
        params.intensities.length === params.pointCloudData.length / 3;
      const hasClassification =
        params.classifications != null &&
        params.classifications.length === params.pointCloudData.length / 3;

      const header = {
        type: 'voxel_downsample_python',
        requestId,
        voxelSize: params.voxelSize,
        globalBounds: params.globalBounds,
        dataLength: params.pointCloudData.length,
        hasColors: hasColors || undefined,
        hasIntensity: hasIntensity || undefined,
        hasClassification: hasClassification || undefined,
      };

      this.ws!.send(JSON.stringify(header));

      if (!hasColors && !hasIntensity && !hasClassification) {
        this.ws!.send(
          params.pointCloudData.buffer.slice(
            params.pointCloudData.byteOffset,
            params.pointCloudData.byteOffset + params.pointCloudData.byteLength
          )
        );
      } else {
        const pointCount = params.pointCloudData.length / 3;
        const posBytes = params.pointCloudData.byteLength;
        const colorBytes = hasColors ? pointCount * 3 * 4 : 0;
        const intensityBytes = hasIntensity ? pointCount * 4 : 0;
        const classBytes = hasClassification ? pointCount : 0;
        const total = posBytes + colorBytes + intensityBytes + classBytes;
        const combined = new ArrayBuffer(total);
        const u8 = new Uint8Array(combined);
        let off = 0;
        u8.set(
          new Uint8Array(
            params.pointCloudData.buffer,
            params.pointCloudData.byteOffset,
            posBytes
          ),
          off
        );
        off += posBytes;
        if (hasColors && params.colors) {
          u8.set(
            new Uint8Array(
              params.colors.buffer,
              params.colors.byteOffset,
              params.colors.byteLength
            ),
            off
          );
          off += params.colors.byteLength;
        }
        if (hasIntensity && params.intensities) {
          u8.set(
            new Uint8Array(
              params.intensities.buffer,
              params.intensities.byteOffset,
              params.intensities.byteLength
            ),
            off
          );
          off += params.intensities.byteLength;
        }
        if (hasClassification && params.classifications) {
          u8.set(
            new Uint8Array(
              params.classifications.buffer,
              params.classifications.byteOffset,
              params.classifications.byteLength
            ),
            off
          );
        }
        this.ws!.send(combined);
      }
    });
  }

  private destroy(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.clear();
  }
}
