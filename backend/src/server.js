import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { spawn } from 'child_process';
import path from 'path';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

// Process pool for C++ executables
class ProcessPool {
  constructor(executablePath, poolSize = 4) {
    this.executablePath = executablePath;
    this.poolSize = poolSize;
    this.available = [];
    this.busy = new Set();
    this.initialize();
  }

  async initialize() {
    for (let i = 0; i < this.poolSize; i++) {
      const process = this.createProcess();
      this.available.push(process);
    }
    console.log(`🔧 ProcessPool: Initialized ${this.poolSize} processes for ${this.executablePath}`);
  }

  createProcess() {
    const process = spawn(this.executablePath);
    process.isReady = false;
    process.isBusy = false;
    
    process.on('error', (error) => {
      console.error('Process error:', error);
      this.removeProcess(process);
    });

    process.on('exit', (code) => {
      console.log(`Process exited with code ${code}`);
      this.removeProcess(process);
    });

    return process;
  }

  removeProcess(process) {
    this.available = this.available.filter(p => p !== process);
    this.busy.delete(process);
    
    // Create a new process to maintain pool size
    if (this.available.length + this.busy.size < this.poolSize) {
      const newProcess = this.createProcess();
      this.available.push(newProcess);
    }
  }

  async getProcess() {
    return new Promise((resolve) => {
      const checkForAvailable = () => {
        if (this.available.length > 0) {
          const process = this.available.pop();
          this.busy.add(process);
          process.isBusy = true;
          resolve(process);
        } else {
          setTimeout(checkForAvailable, 10);
        }
      };
      checkForAvailable();
    });
  }

  releaseProcess(process) {
    this.busy.delete(process);
    process.isBusy = false;
    this.available.push(process);
  }
}

import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Initialize process pools - increase size for better parallelization
const voxelDownsamplePool = new ProcessPool(path.join(__dirname, 'services', 'tools', 'voxel_downsample', 'voxel_downsample'), 8);
const voxelDebugPool = new ProcessPool(path.join(__dirname, 'services', 'tools', 'voxel_debug', 'voxel_debug'), 4);
const pointSmoothPool = new ProcessPool(path.join(__dirname, 'services', 'tools', 'point_smooth', 'point_smooth_cpp'), 4);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3003;

// WebSocket server for simple single-request processing
const wss = new WebSocketServer({ server });
console.log('🔧 Backend: WebSocket server created on port', PORT);
console.log('🔧 Backend: WebSocket server listening for connections...');

wss.on('connection', (ws, req) => {
  console.log('🔧 WebSocket client connected from:', req.socket.remoteAddress);
  console.log('🔧 WebSocket readyState:', ws.readyState);
  console.log('🔧 WebSocket URL:', req.url);
  
  let pendingHeader = null;
  
  ws.on('message', async (data) => {
    try {
      console.log('🔧 Backend: WebSocket message received', {
        isBuffer: data instanceof Buffer,
        dataType: typeof data,
        dataLength: data.length || data.byteLength,
        firstBytes: data instanceof Buffer ? data.slice(0, 10).toString() : data.toString().substring(0, 10)
      });
      
      // Check if this is a Python message
      if (data.toString().includes('voxel_downsample_python')) {
        console.log('🔧 Backend: Python message detected:', data.toString());
      }
      
      // Check if this is binary data or JSON header
      // First, try to parse as JSON string (even if it's a Buffer)
      let message;
      try {
        const dataString = data.toString();
        message = JSON.parse(dataString);
        
        // Handle JSON messages
        if (message.type === 'test') {
          console.log('🔧 Backend: Received test message from frontend:', message.message);
          ws.send(JSON.stringify({ type: 'test_response', message: 'Hello from backend' }));
        } else if (message.type === 'voxel_downsample') {
          // Store header and wait for binary data
          pendingHeader = message;
        } else if (message.type === 'voxel_downsample_rust') {
          // Store header and wait for binary data
          console.log('🔧 Backend: Setting pendingHeader for voxel_downsample_rust:', message);
          pendingHeader = message;
        } else if (message.type === 'point_smooth_rust') {
          // Store header and wait for binary data
          pendingHeader = message;
        } else if (message.type === 'point_smooth_cpp') {
          // Store header and wait for binary data
          console.log('🔧 Backend: Setting pendingHeader for point_smooth_cpp:', message);
          pendingHeader = message;
        } else if (message.type === 'point_smooth_python') {
          // Store header and wait for binary data
          console.log('🔧 Backend: Setting pendingHeader for point_smooth_python:', message);
          pendingHeader = message;
        } else if (message.type === 'voxel_debug_cpp') {
          // Store header and wait for binary data
          pendingHeader = message;
        } else if (message.type === 'voxel_debug_rust') {
          // Store header and wait for binary data
          pendingHeader = message;
        } else if (message.type === 'voxel_debug_python') {
          // Store header and wait for binary data
          console.log('🔧 Backend: Setting pendingHeader for voxel_debug_python:', message);
          pendingHeader = message;
        } else if (message.type === 'voxel_downsample_python') {
          // Store header and wait for binary data
          console.log('🔧 Backend: Setting pendingHeader for voxel_downsample_python:', message);
          console.log('🔧 Backend: Message received for Python BE processing');
          pendingHeader = message;
        }
        return; // Exit early for JSON messages
      } catch (parseError) {
        // Not JSON, treat as binary data
      }
      
      if (data instanceof Buffer) {
        // This is binary point cloud data
        if (pendingHeader) {
          const { type, voxelSize, globalBounds, requestId, smoothingRadius, iterations } = pendingHeader;
          
          // Convert binary data to Float32Array
          const points = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
          console.log('🔧 WebSocket: Binary data conversion debug', {
            dataByteLength: data.byteLength,
            dataByteOffset: data.byteOffset,
            pointsLength: points.length,
            firstFewPoints: Array.from(points.slice(0, 10))
          });
          
          // Try alternative conversion method
          const pointsAlt = new Float32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
          console.log('🔧 WebSocket: Alternative conversion', {
            pointsAltLength: pointsAlt.length,
            firstFewPointsAlt: Array.from(pointsAlt.slice(0, 10))
          });
          
          console.log('🔧 WebSocket: Processing with binary data', {
            type,
            pointCount: points.length / 3,
            voxelSize,
            requestId
          });
          
          const startTime = Date.now();
          const pointCount = points.length / 3;
          
          if (type === 'voxel_downsample') {
            // Use C++ backend with binary protocol (no JSON serialization!)
            // OPTIMIZATION: Spawn fresh process like Rust (no pool overhead)
            const cppExecutable = path.join(__dirname, 'services', 'tools', 'voxel_downsample', 'voxel_downsample');
            const cppProcess = spawn(cppExecutable);
          
            // Create binary header buffer (32 bytes: 4 for uint32 + 7*4 for floats)
            const headerBuffer = Buffer.allocUnsafe(32);
            headerBuffer.writeUInt32LE(pointCount, 0);
            headerBuffer.writeFloatLE(voxelSize, 4);
            headerBuffer.writeFloatLE(globalBounds.minX, 8);
            headerBuffer.writeFloatLE(globalBounds.minY, 12);
            headerBuffer.writeFloatLE(globalBounds.minZ, 16);
            headerBuffer.writeFloatLE(globalBounds.maxX, 20);
            headerBuffer.writeFloatLE(globalBounds.maxY, 24);
            headerBuffer.writeFloatLE(globalBounds.maxZ, 28);
            
            // Convert Float32Array to Buffer for point data (binary, no JSON!)
            const pointDataBuffer = Buffer.from(points.buffer, points.byteOffset, points.byteLength);
            
            // Combine header + data
            const inputBuffer = Buffer.concat([headerBuffer, pointDataBuffer]);
          
            let outputBuffer = Buffer.alloc(0);
            let errorBuffer = '';
          
          cppProcess.stdout.on('data', (data) => {
              outputBuffer = Buffer.concat([outputBuffer, data]);
          });
          
          cppProcess.on('close', (code) => {
            if (code !== 0) {
              console.error(`C++ process exited with code ${code}`);
              ws.send(JSON.stringify({
                type: 'voxel_downsample_result',
                requestId,
                success: false,
                  error: `C++ process exited with code ${code}. Stderr: ${errorBuffer}`
              }));
              return;
            }
            
            try {
                // Read binary output (no JSON parsing!)
                // Binary format: [uint32_t outputCount][float* downsampledPoints]
                if (outputBuffer.length < 4) {
                  throw new Error(`Invalid binary output: too short (${outputBuffer.length} bytes, expected at least 4)`);
                }
                
                const outputCount = outputBuffer.readUInt32LE(0);
                const expectedSize = 4 + outputCount * 3 * 4;
                
                if (outputBuffer.length < expectedSize) {
                  throw new Error(`Invalid binary output: expected ${expectedSize} bytes, got ${outputBuffer.length}`);
                }
                
                // Extract downsampled points (skip 4-byte header)
                const downsampledPointsBuffer = outputBuffer.slice(4, expectedSize);
                const downsampledPoints = new Float32Array(downsampledPointsBuffer.buffer, downsampledPointsBuffer.byteOffset, outputCount * 3);
                
              const processingTime = Date.now() - startTime;
              
              // Send binary response directly (no JSON conversion overhead!)
              // Format: JSON header with metadata, then binary data
              const responseHeader = {
                type: 'voxel_downsample_result',
                requestId,
                success: true,
                originalCount: pointCount,
                downsampledCount: outputCount,
                voxelCount: outputCount,
                processingTime,
                dataLength: outputCount * 3
              };
              
              // Send header as JSON
              ws.send(JSON.stringify(responseHeader));
              
              // Send binary data directly - use the sliced buffer, not the Float32Array's buffer
              // (Float32Array.buffer might include extra data beyond the slice)
              ws.send(downsampledPointsBuffer);
            } catch (parseError) {
                console.error('C++ Binary protocol error:', parseError);
              const processingTime = Date.now() - startTime;
              
              ws.send(JSON.stringify({
                type: 'voxel_downsample_result',
                requestId,
                  success: false,
                  error: `Binary protocol error: ${parseError.message}. Stderr: ${errorBuffer}`,
                processingTime
              }));
            }
          });
          
          cppProcess.stderr.on('data', (data) => {
              errorBuffer += data.toString();
          });
          
          cppProcess.on('error', (error) => {
            console.error('C++ process error:', error);
            ws.send(JSON.stringify({
              type: 'voxel_downsample_result',
              requestId,
              success: false,
              error: 'C++ process failed to start'
            }));
          });
          
            // Send binary input to C++ process (no JSON serialization!)
            cppProcess.stdin.write(inputBuffer);
          cppProcess.stdin.end();
          
          } else if (type === 'voxel_downsample_rust') {
            // Use Rust backend with binary protocol (no JSON serialization!)
            const rustExecutable = path.join(__dirname, 'services', 'tools', 'target', 'release', 'voxel_downsample_rust');
            
            let rustProcess;
            try {
              rustProcess = spawn(rustExecutable);
            } catch (spawnError) {
              console.error('Failed to spawn Rust process:', spawnError);
              ws.send(JSON.stringify({
                type: 'voxel_downsample_rust_result',
                requestId,
                success: false,
                error: 'Failed to spawn Rust process: ' + spawnError.message
              }));
              return;
            }
            
            // Create binary header buffer (32 bytes: 4 for u32 + 7*4 for floats)
            const headerBuffer = Buffer.allocUnsafe(32);
            headerBuffer.writeUInt32LE(pointCount, 0);
            headerBuffer.writeFloatLE(voxelSize, 4);
            headerBuffer.writeFloatLE(globalBounds.minX, 8);
            headerBuffer.writeFloatLE(globalBounds.minY, 12);
            headerBuffer.writeFloatLE(globalBounds.minZ, 16);
            headerBuffer.writeFloatLE(globalBounds.maxX, 20);
            headerBuffer.writeFloatLE(globalBounds.maxY, 24);
            headerBuffer.writeFloatLE(globalBounds.maxZ, 28);
            
            // Convert Float32Array to Buffer for point data (binary, no JSON!)
            const pointDataBuffer = Buffer.from(points.buffer, points.byteOffset, points.byteLength);
            
            // Combine header + data
            const inputBuffer = Buffer.concat([headerBuffer, pointDataBuffer]);
            
            let outputBuffer = Buffer.alloc(0);
            let errorBuffer = '';
            
            rustProcess.stdout.on('data', (data) => {
              outputBuffer = Buffer.concat([outputBuffer, data]);
            });
            
            rustProcess.stderr.on('data', (data) => {
              errorBuffer += data.toString();
            });
            
            rustProcess.on('error', (error) => {
              console.error('Rust process error:', error);
              ws.send(JSON.stringify({
                type: 'voxel_downsample_rust_result',
                requestId,
                success: false,
                error: 'Rust process failed to start'
              }));
            });
            
            rustProcess.on('close', (code) => {
              if (code !== 0) {
                console.error(`Rust process exited with code ${code}`);
                ws.send(JSON.stringify({
                  type: 'voxel_downsample_rust_result',
                  requestId,
                  success: false,
                  error: `Rust process exited with code ${code}: ${errorBuffer}`
                }));
                return;
              }
              
              try {
                // Read binary output (no JSON parsing!)
                // Binary format: [u32 outputCount][f32* downsampledPoints]
                if (outputBuffer.length < 4) {
                  throw new Error(`Invalid binary output: too short (${outputBuffer.length} bytes, expected at least 4)`);
                }
                
                const outputCount = outputBuffer.readUInt32LE(0);
                const expectedSize = 4 + outputCount * 3 * 4;
                
                if (outputBuffer.length < expectedSize) {
                  throw new Error(`Invalid binary output: expected ${expectedSize} bytes, got ${outputBuffer.length}`);
                }
                
                // Extract downsampled points (skip 4-byte header)
                const downsampledPointsBuffer = outputBuffer.slice(4, expectedSize);
                const downsampledPoints = new Float32Array(downsampledPointsBuffer.buffer, downsampledPointsBuffer.byteOffset, outputCount * 3);
                
                const processingTime = Date.now() - startTime;
                
                // Send binary response directly (no JSON conversion overhead!)
                // Format: JSON header with metadata, then binary data
                const responseHeader = {
                  type: 'voxel_downsample_rust_result',
                  requestId,
                  success: true,
                  originalCount: pointCount,
                  downsampledCount: outputCount,
                  voxelCount: outputCount,
                  processingTime,
                  dataLength: outputCount * 3
                };
                
                // Send header as JSON
                ws.send(JSON.stringify(responseHeader));
                
                // Send binary data directly - use the sliced buffer, not the Float32Array's buffer
                ws.send(downsampledPointsBuffer);
              } catch (parseError) {
                console.error('Rust Binary protocol error:', parseError);
                ws.send(JSON.stringify({
                  type: 'voxel_downsample_rust_result',
                  requestId,
                  success: false,
                  error: `Binary protocol error: ${parseError.message}. Stderr: ${errorBuffer}`
                }));
              }
            });
            
            // Send binary input to Rust process (no JSON serialization!)
            rustProcess.stdin.write(inputBuffer);
            rustProcess.stdin.end();
            
          } else if (type === 'point_smooth_rust') {
            // Handle Rust point cloud smoothing
            const rustExecutable = path.join(__dirname, 'services', 'tools', 'point_smooth', 'point_smooth_rust');
            console.log('🔧 Rust point smooth executable:', rustExecutable);
            const rustProcess = spawn(rustExecutable);
            
            // Use binary protocol (same as voxel downsampling)
            const pointCount = points.length / 3;
            const pointsFloat32 = new Float32Array(points);
            
            // Create binary header buffer (12 bytes: 4 for u32 + 4 for f32 + 4 for f32)
            const headerBuffer = Buffer.allocUnsafe(12);
            headerBuffer.writeUInt32LE(pointCount, 0);
            headerBuffer.writeFloatLE(smoothingRadius, 4);
            headerBuffer.writeFloatLE(iterations, 8);
            
            // Convert Float32Array to Buffer for point data (binary, no JSON!)
            const pointDataBuffer = Buffer.from(pointsFloat32.buffer, pointsFloat32.byteOffset, pointsFloat32.byteLength);
            
            // Combine header + data
            const inputBuffer = Buffer.concat([headerBuffer, pointDataBuffer]);
            
            let outputBuffer = Buffer.alloc(0);
            let errorData = '';
            
            rustProcess.stdout.on('data', (data) => {
              outputBuffer = Buffer.concat([outputBuffer, data]);
            });
            
            rustProcess.stderr.on('data', (data) => {
              const errorText = data.toString();
              errorData += errorText;
              if (errorText.trim()) {
                console.error('🔧 WebSocket: Rust point smooth stderr:', errorText);
              }
            });
            
            rustProcess.on('error', (error) => {
              console.error('🔧 WebSocket: Rust point smooth process error:', error);
              ws.send(JSON.stringify({
                type: 'point_smooth_rust_result',
                requestId,
                success: false,
                error: 'Rust process failed to start'
              }));
            });
            
            rustProcess.on('close', (code) => {
              console.log(`🔧 WebSocket: Rust point smooth process closed with code ${code}, outputBuffer.length: ${outputBuffer.length}`);
              
              if (code !== 0) {
                console.error(`🔧 WebSocket: Rust point smooth process exited with code ${code}`);
                ws.send(JSON.stringify({
                  type: 'point_smooth_rust_result',
                  requestId,
                  success: false,
                  error: `Rust process exited with code ${code}: ${errorData}`
                }));
                return;
              }
              
              try {
                // Read binary output (no JSON parsing!)
                // Binary format: [u32 pointCount][f32* smoothedPoints]
                if (outputBuffer.length < 4) {
                  throw new Error(`Invalid binary output: too short (${outputBuffer.length} bytes, expected at least 4)`);
                }
                
                const outputCount = outputBuffer.readUInt32LE(0);
                const expectedSize = 4 + outputCount * 3 * 4; // 4 bytes header + outputCount * 3 floats * 4 bytes
                
                if (outputBuffer.length < expectedSize) {
                  throw new Error(`Invalid binary output: expected ${expectedSize} bytes, got ${outputBuffer.length}`);
                }
                
                // Extract smoothed points (skip 4-byte header)
                const smoothedPointsBuffer = outputBuffer.slice(4, expectedSize);
                const smoothedPoints = new Float32Array(smoothedPointsBuffer.buffer, smoothedPointsBuffer.byteOffset, outputCount * 3);
                
                const processingTime = Date.now() - startTime;
                
                // Send binary response directly (no JSON conversion overhead!)
                // Format: JSON header with metadata, then binary data
                const responseHeader = {
                  type: 'point_smooth_rust_result',
                  requestId,
                  success: true,
                  originalCount: pointCount,
                  smoothedCount: outputCount,
                  processingTime: processingTime,
                  smoothingRadius: smoothingRadius,
                  iterations: iterations,
                  dataLength: outputCount * 3
                };
                
                // Send header as JSON
                ws.send(JSON.stringify(responseHeader));
                
                // Send binary data directly - use the sliced buffer
                ws.send(smoothedPointsBuffer);
              } catch (parseError) {
                console.error('🔧 WebSocket: Rust point smooth binary protocol error:', parseError);
                console.error('🔧 WebSocket: Rust point smooth stderr:', errorData);
                console.error('🔧 WebSocket: Rust point smooth stdout length:', outputBuffer.length);
                ws.send(JSON.stringify({
                  type: 'point_smooth_rust_result',
                  requestId,
                  success: false,
                  error: `Binary protocol error: ${parseError.message}`
                }));
              }
            });
            
            // Send binary input to Rust process (no JSON serialization!)
            console.log('🔧 WebSocket: Writing', inputBuffer.length, 'bytes to Rust point smooth stdin');
            rustProcess.stdin.write(inputBuffer);
            rustProcess.stdin.end();
            
          } else if (type === 'point_smooth_cpp') {
            // Handle C++ point cloud smoothing
            const cppExecutable = path.join(__dirname, 'services', 'tools', 'point_smooth', 'point_smooth_cpp');
            const cppProcess = spawn(cppExecutable);
            
            // Use binary protocol (same as Rust)
            const pointCount = points.length / 3;
            const pointsFloat32 = new Float32Array(points);
            
            // Create binary header buffer (12 bytes: 4 for u32 + 4 for f32 + 4 for f32)
            const headerBuffer = Buffer.allocUnsafe(12);
            headerBuffer.writeUInt32LE(pointCount, 0);
            headerBuffer.writeFloatLE(smoothingRadius, 4);
            headerBuffer.writeFloatLE(iterations, 8);
            
            // Convert Float32Array to Buffer for point data (binary, no JSON!)
            const pointDataBuffer = Buffer.from(pointsFloat32.buffer, pointsFloat32.byteOffset, pointsFloat32.byteLength);
            
            // Combine header + data
            const inputBuffer = Buffer.concat([headerBuffer, pointDataBuffer]);
            
            let outputBuffer = Buffer.alloc(0);
            let errorData = '';
            
            cppProcess.stdout.on('data', (data) => {
              outputBuffer = Buffer.concat([outputBuffer, data]);
            });
            
            cppProcess.stderr.on('data', (data) => {
              const errorText = data.toString();
              errorData += errorText;
              if (errorText.trim()) {
                console.error('🔧 WebSocket: C++ point smooth stderr:', errorText);
              }
            });
            
            cppProcess.on('error', (error) => {
              console.error('🔧 WebSocket: C++ point smooth process error:', error);
              ws.send(JSON.stringify({
                type: 'point_smooth_cpp_result',
                requestId,
                success: false,
                error: 'C++ process failed to start'
              }));
            });
            
            cppProcess.on('close', (code) => {
              console.log(`🔧 WebSocket: C++ point smooth process closed with code ${code}, outputBuffer.length: ${outputBuffer.length}`);
              
              if (code !== 0) {
                console.error(`🔧 WebSocket: C++ point smooth process exited with code ${code}`);
                ws.send(JSON.stringify({
                  type: 'point_smooth_cpp_result',
                  requestId,
                  success: false,
                  error: `C++ process exited with code ${code}: ${errorData}`
                }));
                return;
              }
              
              try {
                // Read binary output (no JSON parsing!)
                // Binary format: [u32 pointCount][f32* smoothedPoints]
                if (outputBuffer.length < 4) {
                  throw new Error(`Invalid binary output: too short (${outputBuffer.length} bytes, expected at least 4)`);
                }
                
                const outputCount = outputBuffer.readUInt32LE(0);
                const expectedSize = 4 + outputCount * 3 * 4; // 4 bytes header + outputCount * 3 floats * 4 bytes
                
                if (outputBuffer.length < expectedSize) {
                  throw new Error(`Invalid binary output: expected ${expectedSize} bytes, got ${outputBuffer.length}`);
                }
                
                // Extract smoothed points (skip 4-byte header)
                const smoothedPointsBuffer = outputBuffer.slice(4, expectedSize);
                const smoothedPoints = new Float32Array(smoothedPointsBuffer.buffer, smoothedPointsBuffer.byteOffset, outputCount * 3);
                
                const processingTime = Date.now() - startTime;
                
                // Send binary response directly (no JSON conversion overhead!)
                // Format: JSON header with metadata, then binary data
                const responseHeader = {
                  type: 'point_smooth_cpp_result',
                  requestId,
                  success: true,
                  originalCount: pointCount,
                  smoothedCount: outputCount,
                  processingTime: processingTime,
                  smoothingRadius: smoothingRadius,
                  iterations: iterations,
                  dataLength: outputCount * 3
                };
                
                // Send header as JSON
                ws.send(JSON.stringify(responseHeader));
                
                // Send binary data directly - use the sliced buffer
                ws.send(smoothedPointsBuffer);
              } catch (parseError) {
                console.error('🔧 WebSocket: C++ point smooth binary protocol error:', parseError);
                console.error('🔧 WebSocket: C++ point smooth stderr:', errorData);
                console.error('🔧 WebSocket: C++ point smooth stdout length:', outputBuffer.length);
                ws.send(JSON.stringify({
                  type: 'point_smooth_cpp_result',
                  requestId,
                  success: false,
                  error: `Binary protocol error: ${parseError.message}`
                }));
              }
            });
            
            // Send binary input to C++ process (no JSON serialization!)
            console.log('🔧 WebSocket: Writing', inputBuffer.length, 'bytes to C++ point smooth stdin');
            cppProcess.stdin.write(inputBuffer);
            cppProcess.stdin.end();
            
          } else if (type === 'point_smooth_python') {
            // Handle Python point cloud smoothing
            const pythonExecutable = path.join(__dirname, 'services', 'tools', 'point_smooth', 'point_smooth_cython_wrapper.py');
            
            let pythonProcess;
            try {
              pythonProcess = spawn('python3', [pythonExecutable]);
            } catch (spawnError) {
              console.error('🔧 WebSocket: Failed to spawn Python process:', spawnError);
              ws.send(JSON.stringify({
                type: 'point_smooth_python_result',
                requestId,
                success: false,
                error: 'Failed to spawn Python process: ' + spawnError.message
              }));
              return;
            }
            
            // Use binary protocol (same as Rust/C++)
            const pointCount = points.length / 3;
            const pointsFloat32 = new Float32Array(points);
            
            // Create binary header buffer (12 bytes: 4 for u32 + 4 for f32 + 4 for f32)
            const headerBuffer = Buffer.allocUnsafe(12);
            headerBuffer.writeUInt32LE(pointCount, 0);
            headerBuffer.writeFloatLE(smoothingRadius, 4);
            headerBuffer.writeFloatLE(iterations, 8);
            
            // Convert Float32Array to Buffer for point data (binary, no JSON!)
            const pointDataBuffer = Buffer.from(pointsFloat32.buffer, pointsFloat32.byteOffset, pointsFloat32.byteLength);
            
            // Combine header + data
            const inputBuffer = Buffer.concat([headerBuffer, pointDataBuffer]);
            
            let outputBuffer = Buffer.alloc(0);
            let errorData = '';
            
            pythonProcess.stdout.on('data', (data) => {
              outputBuffer = Buffer.concat([outputBuffer, data]);
            });
            
            pythonProcess.stderr.on('data', (data) => {
              const errorText = data.toString();
              errorData += errorText;
              if (errorText.trim()) {
                console.error('🔧 WebSocket: Python point smooth stderr:', errorText);
              }
            });
            
            pythonProcess.on('error', (error) => {
              console.error('🔧 WebSocket: Python point smooth process error:', error);
              ws.send(JSON.stringify({
                type: 'point_smooth_python_result',
                requestId,
                success: false,
                error: 'Python process failed to start'
              }));
            });
            
            pythonProcess.on('close', (code) => {
              console.log(`🔧 WebSocket: Python point smooth process closed with code ${code}, outputBuffer.length: ${outputBuffer.length}`);
              
              if (code !== 0) {
                console.error(`🔧 WebSocket: Python point smooth process exited with code ${code}`);
                ws.send(JSON.stringify({
                  type: 'point_smooth_python_result',
                  requestId,
                  success: false,
                  error: `Python process exited with code ${code}: ${errorData}`
                }));
                return;
              }
              
              try {
                // Read binary output (no JSON parsing!)
                // Binary format: [u32 pointCount][f32* smoothedPoints]
                if (outputBuffer.length < 4) {
                  throw new Error(`Invalid binary output: too short (${outputBuffer.length} bytes, expected at least 4)`);
                }
                
                const outputCount = outputBuffer.readUInt32LE(0);
                const expectedSize = 4 + outputCount * 3 * 4; // 4 bytes header + outputCount * 3 floats * 4 bytes
                
                if (outputBuffer.length < expectedSize) {
                  throw new Error(`Invalid binary output: expected ${expectedSize} bytes, got ${outputBuffer.length}`);
                }
                
                // Extract smoothed points (skip 4-byte header)
                const smoothedPointsBuffer = outputBuffer.slice(4, expectedSize);
                const smoothedPoints = new Float32Array(smoothedPointsBuffer.buffer, smoothedPointsBuffer.byteOffset, outputCount * 3);
                
                const processingTime = Date.now() - startTime;
                
                // Send binary response directly (no JSON conversion overhead!)
                // Format: JSON header with metadata, then binary data
                const responseHeader = {
                  type: 'point_smooth_python_result',
                  requestId,
                  success: true,
                  originalCount: pointCount,
                  smoothedCount: outputCount,
                  processingTime: processingTime,
                  smoothingRadius: smoothingRadius,
                  iterations: iterations,
                  dataLength: outputCount * 3
                };
                
                // Send header as JSON
                ws.send(JSON.stringify(responseHeader));
                
                // Send binary data directly - use the sliced buffer
                ws.send(smoothedPointsBuffer);
              } catch (parseError) {
                console.error('🔧 WebSocket: Python point smooth binary protocol error:', parseError);
                console.error('🔧 WebSocket: Python point smooth stderr:', errorData);
                console.error('🔧 WebSocket: Python point smooth stdout length:', outputBuffer.length);
                ws.send(JSON.stringify({
                  type: 'point_smooth_python_result',
                  requestId,
                  success: false,
                  error: `Binary protocol error: ${parseError.message}`
                }));
              }
            });
            
            // Send binary input to Python process (no JSON serialization!)
            console.log('🔧 WebSocket: Writing', inputBuffer.length, 'bytes to Python point smooth stdin');
            pythonProcess.stdin.write(inputBuffer);
            pythonProcess.stdin.end();
            
          } else if (type === 'voxel_debug_cpp') {
            // Handle C++ voxel debug
            console.log('🔧 WebSocket: Starting C++ voxel debug process');
            const cppExecutable = path.join(__dirname, 'services', 'tools', 'voxel_debug', 'voxel_debug');
            console.log('🔧 WebSocket: C++ executable path:', cppExecutable);
            
            let cppProcess;
            try {
              cppProcess = spawn(cppExecutable);
              console.log('🔧 WebSocket: C++ process spawned successfully');
            } catch (spawnError) {
              console.error('🔧 WebSocket: Failed to spawn C++ process:', spawnError);
              ws.send(JSON.stringify({
                type: 'voxel_debug_cpp_result',
                requestId,
                success: false,
                error: 'Failed to spawn C++ process: ' + spawnError.message
              }));
              return;
            }
            
            // Use binary protocol (same as HTTP endpoint)
            const pointCount = points.length / 3;
            const pointsFloat32 = new Float32Array(points);
            
            // Create binary header buffer (32 bytes: 4 for u32 + 7*4 for floats)
            const headerBuffer = Buffer.allocUnsafe(32);
            headerBuffer.writeUInt32LE(pointCount, 0);
            headerBuffer.writeFloatLE(voxelSize, 4);
            headerBuffer.writeFloatLE(globalBounds.minX, 8);
            headerBuffer.writeFloatLE(globalBounds.minY, 12);
            headerBuffer.writeFloatLE(globalBounds.minZ, 16);
            headerBuffer.writeFloatLE(globalBounds.maxX, 20);
            headerBuffer.writeFloatLE(globalBounds.maxY, 24);
            headerBuffer.writeFloatLE(globalBounds.maxZ, 28);
            
            // Convert Float32Array to Buffer for point data (binary, no JSON!)
            const pointDataBuffer = Buffer.from(pointsFloat32.buffer, pointsFloat32.byteOffset, pointsFloat32.byteLength);
            
            // Combine header + data
            const inputBuffer = Buffer.concat([headerBuffer, pointDataBuffer]);
            
            let outputBuffer = Buffer.alloc(0);
            let errorData = '';

            cppProcess.stdout.on('data', (data) => {
              outputBuffer = Buffer.concat([outputBuffer, data]);
            });

            cppProcess.stderr.on('data', (data) => {
              const errorText = data.toString();
              errorData += errorText;
              if (errorText.trim()) {
                console.error('🔧 WebSocket: C++ voxel debug stderr:', errorText);
              }
            });

            cppProcess.on('error', (error) => {
              console.error('🔧 WebSocket: C++ voxel debug process error:', error);
              ws.send(JSON.stringify({
                type: 'voxel_debug_cpp_result',
                requestId,
                success: false,
                error: 'C++ process failed to start'
              }));
            });
            
            cppProcess.on('close', (code) => {
              console.log(`🔧 WebSocket: C++ voxel debug process closed with code ${code}, outputBuffer.length: ${outputBuffer.length}`);
              
              if (code !== 0) {
                console.error(`🔧 WebSocket: C++ voxel debug process exited with code ${code}`);
                ws.send(JSON.stringify({
                  type: 'voxel_debug_cpp_result',
                  requestId,
                  success: false,
                  error: `C++ process exited with code ${code}: ${errorData}`
                }));
                return;
              }

              try {
                // Read binary output (no JSON parsing!)
                // Binary format: [u32 voxelCount][f32* voxelGridPositions]
                if (outputBuffer.length < 4) {
                  throw new Error(`Invalid binary output: too short (${outputBuffer.length} bytes, expected at least 4)`);
                }
                
                const voxelCount = outputBuffer.readUInt32LE(0);
                const expectedSize = 4 + voxelCount * 3 * 4; // 4 bytes header + voxelCount * 3 floats * 4 bytes
                
                if (outputBuffer.length < expectedSize) {
                  throw new Error(`Invalid binary output: expected ${expectedSize} bytes, got ${outputBuffer.length}`);
                }
                
                // Extract voxel grid positions (skip 4-byte header)
                const voxelGridPositionsBuffer = outputBuffer.slice(4, expectedSize);
                const voxelGridPositions = new Float32Array(voxelGridPositionsBuffer.buffer, voxelGridPositionsBuffer.byteOffset, voxelCount * 3);
                
                const processingTime = Date.now() - startTime;

                // Send binary response directly (no JSON conversion overhead!)
                // Format: JSON header with metadata, then binary data
                const responseHeader = {
                  type: 'voxel_debug_cpp_result',
                  requestId,
                  success: true,
                  voxelCount: voxelCount,
                  processingTime: processingTime,
                  dataLength: voxelCount * 3
                };
                
                // Send header as JSON
                ws.send(JSON.stringify(responseHeader));
                
                // Send binary data directly - use the sliced buffer
                ws.send(voxelGridPositionsBuffer);
              } catch (parseError) {
                console.error('🔧 WebSocket: C++ voxel debug binary protocol error:', parseError);
                console.error('🔧 WebSocket: C++ voxel debug stderr:', errorData);
                console.error('🔧 WebSocket: C++ voxel debug stdout length:', outputBuffer.length);
                ws.send(JSON.stringify({
                  type: 'voxel_debug_cpp_result',
                  requestId,
                  success: false,
                  error: `Binary protocol error: ${parseError.message}`
                }));
              }
            });
            
            // Send binary input to C++ process (no JSON serialization!)
            console.log('🔧 WebSocket: Writing', inputBuffer.length, 'bytes to C++ voxel debug stdin');
            cppProcess.stdin.write(inputBuffer);
            cppProcess.stdin.end();
            
          } else if (type === 'voxel_debug_rust') {
            // Handle Rust voxel debug
            console.log('🔧 WebSocket: Starting Rust voxel debug process');
            const rustExecutable = path.join(__dirname, 'services', 'tools', 'voxel_debug', 'voxel_debug_rust');
            console.log('🔧 WebSocket: Rust executable path:', rustExecutable);
            
            let rustProcess;
            try {
              rustProcess = spawn(rustExecutable);
              console.log('🔧 WebSocket: Rust process spawned successfully');
            } catch (spawnError) {
              console.error('🔧 WebSocket: Failed to spawn Rust process:', spawnError);
              ws.send(JSON.stringify({
                type: 'voxel_debug_rust_result',
                requestId,
                success: false,
                error: 'Failed to spawn Rust process: ' + spawnError.message
              }));
              return;
            }
            
            // Use binary protocol (same as HTTP endpoint)
            const pointCount = points.length / 3;
            const pointsFloat32 = new Float32Array(points);
            
            // Create binary header buffer (32 bytes: 4 for u32 + 7*4 for floats)
            const headerBuffer = Buffer.allocUnsafe(32);
            headerBuffer.writeUInt32LE(pointCount, 0);
            headerBuffer.writeFloatLE(voxelSize, 4);
            headerBuffer.writeFloatLE(globalBounds.minX, 8);
            headerBuffer.writeFloatLE(globalBounds.minY, 12);
            headerBuffer.writeFloatLE(globalBounds.minZ, 16);
            headerBuffer.writeFloatLE(globalBounds.maxX, 20);
            headerBuffer.writeFloatLE(globalBounds.maxY, 24);
            headerBuffer.writeFloatLE(globalBounds.maxZ, 28);
            
            // Convert Float32Array to Buffer for point data (binary, no JSON!)
            const pointDataBuffer = Buffer.from(pointsFloat32.buffer, pointsFloat32.byteOffset, pointsFloat32.byteLength);
            
            // Combine header + data
            const inputBuffer = Buffer.concat([headerBuffer, pointDataBuffer]);
            
            let outputBuffer = Buffer.alloc(0);
            let errorData = '';

            rustProcess.stdout.on('data', (data) => {
              outputBuffer = Buffer.concat([outputBuffer, data]);
            });

            rustProcess.stderr.on('data', (data) => {
              const errorText = data.toString();
              errorData += errorText;
              if (errorText.trim()) {
                console.error('🔧 WebSocket: Rust voxel debug stderr:', errorText);
              }
            });

            rustProcess.on('error', (error) => {
              console.error('🔧 WebSocket: Rust voxel debug process error:', error);
              ws.send(JSON.stringify({
                type: 'voxel_debug_rust_result',
                requestId,
                success: false,
                error: 'Rust process failed to start'
              }));
            });
            
            rustProcess.on('close', (code) => {
              console.log(`🔧 WebSocket: Rust voxel debug process closed with code ${code}, outputBuffer.length: ${outputBuffer.length}`);
              
              if (code !== 0) {
                console.error(`🔧 WebSocket: Rust voxel debug process exited with code ${code}`);
                ws.send(JSON.stringify({
                  type: 'voxel_debug_rust_result',
                  requestId,
                  success: false,
                  error: `Rust process exited with code ${code}: ${errorData}`
                }));
                return;
              }

              try {
                // Read binary output (no JSON parsing!)
                // Binary format: [u32 voxelCount][f32* voxelGridPositions]
                if (outputBuffer.length < 4) {
                  throw new Error(`Invalid binary output: too short (${outputBuffer.length} bytes, expected at least 4)`);
                }
                
                const voxelCount = outputBuffer.readUInt32LE(0);
                const expectedSize = 4 + voxelCount * 3 * 4; // 4 bytes header + voxelCount * 3 floats * 4 bytes
                
                if (outputBuffer.length < expectedSize) {
                  throw new Error(`Invalid binary output: expected ${expectedSize} bytes, got ${outputBuffer.length}`);
                }
                
                // Extract voxel grid positions (skip 4-byte header)
                const voxelGridPositionsBuffer = outputBuffer.slice(4, expectedSize);
                const voxelGridPositions = new Float32Array(voxelGridPositionsBuffer.buffer, voxelGridPositionsBuffer.byteOffset, voxelCount * 3);
                
                const processingTime = Date.now() - startTime;

                // Send binary response directly (no JSON conversion overhead!)
                // Format: JSON header with metadata, then binary data
                const responseHeader = {
                  type: 'voxel_debug_rust_result',
                  requestId,
                  success: true,
                  voxelCount: voxelCount,
                  processingTime: processingTime,
                  dataLength: voxelCount * 3
                };
                
                // Send header as JSON
                ws.send(JSON.stringify(responseHeader));
                
                // Send binary data directly - use the sliced buffer
                ws.send(voxelGridPositionsBuffer);
              } catch (parseError) {
                console.error('🔧 WebSocket: Rust voxel debug binary protocol error:', parseError);
                console.error('🔧 WebSocket: Rust voxel debug stderr:', errorData);
                console.error('🔧 WebSocket: Rust voxel debug stdout length:', outputBuffer.length);
                ws.send(JSON.stringify({
                  type: 'voxel_debug_rust_result',
                  requestId,
                  success: false,
                  error: `Binary protocol error: ${parseError.message}`
                }));
              }
            });
            
            // Send binary input to Rust process (no JSON serialization!)
            console.log('🔧 WebSocket: Writing', inputBuffer.length, 'bytes to Rust voxel debug stdin');
            rustProcess.stdin.write(inputBuffer);
            rustProcess.stdin.end();
          } else if (type === 'voxel_debug_python') {
            // Handle Python voxel debug
            console.log('🔧 WebSocket: Starting Python voxel debug process');
            console.log('🔧 WebSocket: Processing Python BE request with type:', type);
            console.log('🔧 WebSocket: Python globalBounds:', globalBounds);
            const pythonExecutable = path.join(__dirname, 'services', 'tools', 'voxel_debug', 'voxel_debug_cython.py');
            console.log('🔧 WebSocket: Python executable path:', pythonExecutable);
            
            let pythonProcess;
            try {
              pythonProcess = spawn('python3', [pythonExecutable]);
            } catch (spawnError) {
              console.error('🔧 WebSocket: Failed to spawn Python process:', spawnError);
              ws.send(JSON.stringify({
                type: 'voxel_debug_python_result',
                requestId,
                success: false,
                error: 'Failed to spawn Python process: ' + spawnError.message
              }));
              return;
            }
            
            // Use binary protocol (same as C++/Rust)
            const pointCount = points.length / 3;
            const pointsFloat32 = new Float32Array(points);
            
            // Create binary header buffer (32 bytes: 4 for u32 + 7*4 for floats)
            const headerBuffer = Buffer.allocUnsafe(32);
            headerBuffer.writeUInt32LE(pointCount, 0);
            headerBuffer.writeFloatLE(voxelSize, 4);
            headerBuffer.writeFloatLE(globalBounds.minX, 8);
            headerBuffer.writeFloatLE(globalBounds.minY, 12);
            headerBuffer.writeFloatLE(globalBounds.minZ, 16);
            headerBuffer.writeFloatLE(globalBounds.maxX, 20);
            headerBuffer.writeFloatLE(globalBounds.maxY, 24);
            headerBuffer.writeFloatLE(globalBounds.maxZ, 28);
            
            // Convert Float32Array to Buffer for point data (binary, no JSON!)
            const pointDataBuffer = Buffer.from(pointsFloat32.buffer, pointsFloat32.byteOffset, pointsFloat32.byteLength);
            
            // Combine header + data
            const inputBuffer = Buffer.concat([headerBuffer, pointDataBuffer]);
            
            let outputBuffer = Buffer.alloc(0);
            let errorData = '';
            
            pythonProcess.stdout.on('data', (data) => {
              outputBuffer = Buffer.concat([outputBuffer, data]);
            });
            
            pythonProcess.stderr.on('data', (data) => {
              const errorText = data.toString();
              errorData += errorText;
              if (errorText.trim()) {
                console.error('🔧 WebSocket: Python voxel debug stderr:', errorText);
              }
            });
            
            pythonProcess.on('error', (error) => {
              console.error('🔧 WebSocket: Python process error:', error);
              ws.send(JSON.stringify({
                type: 'voxel_debug_python_result',
                requestId,
                success: false,
                error: 'Python process failed to start'
              }));
            });
            
            pythonProcess.on('close', (code) => {
              console.log(`🔧 WebSocket: Python voxel debug process closed with code ${code}, outputBuffer.length: ${outputBuffer.length}`);
              
              if (code !== 0) {
                console.error(`🔧 WebSocket: Python process exited with code ${code}`);
                ws.send(JSON.stringify({
                  type: 'voxel_debug_python_result',
                  requestId,
                  success: false,
                  error: `Python process exited with code ${code}: ${errorData}`
                }));
                return;
              }
              
              try {
                // Read binary output (no JSON parsing!)
                // Binary format: [u32 voxelCount][f32* voxelGridPositions]
                if (outputBuffer.length < 4) {
                  throw new Error(`Invalid binary output: too short (${outputBuffer.length} bytes, expected at least 4)`);
                }
                
                const voxelCount = outputBuffer.readUInt32LE(0);
                const expectedSize = 4 + voxelCount * 3 * 4; // 4 bytes header + voxelCount * 3 floats * 4 bytes
                
                if (outputBuffer.length < expectedSize) {
                  throw new Error(`Invalid binary output: expected ${expectedSize} bytes, got ${outputBuffer.length}`);
                }
                
                // Extract voxel grid positions (skip 4-byte header)
                const voxelGridPositionsBuffer = outputBuffer.slice(4, expectedSize);
                const voxelGridPositions = new Float32Array(voxelGridPositionsBuffer.buffer, voxelGridPositionsBuffer.byteOffset, voxelCount * 3);
                
                const processingTime = Date.now() - startTime;
                
                // Send binary response directly (no JSON conversion overhead!)
                // Format: JSON header with metadata, then binary data
                const responseHeader = {
                  type: 'voxel_debug_python_result',
                  requestId,
                  success: true,
                  voxelCount: voxelCount,
                  processingTime: processingTime,
                  dataLength: voxelCount * 3
                };
                
                // Send header as JSON
                ws.send(JSON.stringify(responseHeader));
                
                // Send binary data directly - use the sliced buffer
                ws.send(voxelGridPositionsBuffer);
              } catch (parseError) {
                console.error('🔧 WebSocket: Python voxel debug binary protocol error:', parseError);
                console.error('🔧 WebSocket: Python voxel debug stderr:', errorData);
                console.error('🔧 WebSocket: Python voxel debug stdout length:', outputBuffer.length);
                ws.send(JSON.stringify({
                  type: 'voxel_debug_python_result',
                  requestId,
                  success: false,
                  error: `Binary protocol error: ${parseError.message}`
                }));
              }
            });
            
            // Send binary input to Python process (no JSON serialization!)
            console.log('🔧 WebSocket: Writing', inputBuffer.length, 'bytes to Python voxel debug stdin');
            pythonProcess.stdin.write(inputBuffer);
            pythonProcess.stdin.end();
          } else if (type === 'voxel_downsample_python') {
            // Handle Python voxel downsampling
            console.log('🔧 WebSocket: Starting Python voxel downsampling process');
            console.log('🔧 WebSocket: Processing Python BE request with type:', type);
            const pythonExecutable = path.join(__dirname, 'services', 'tools', 'voxel_downsample', 'voxel_downsample_cython.py');
            console.log('🔧 WebSocket: Python executable path:', pythonExecutable);
            
            let pythonProcess;
            try {
              pythonProcess = spawn('python3', [pythonExecutable]);
            } catch (spawnError) {
              console.error('🔧 WebSocket: Failed to spawn Python process:', spawnError);
              ws.send(JSON.stringify({
                type: 'voxel_downsample_python_result',
                requestId,
                success: false,
                error: 'Failed to spawn Python process: ' + spawnError.message
              }));
              return;
            }
            
            // Use binary protocol (same as C++/Rust)
            const pointCount = points.length / 3;
            const pointsFloat32 = new Float32Array(points);
            
            // Create binary header buffer (32 bytes: 4 for u32 + 7*4 for floats)
            const headerBuffer = Buffer.allocUnsafe(32);
            headerBuffer.writeUInt32LE(pointCount, 0);
            headerBuffer.writeFloatLE(voxelSize, 4);
            headerBuffer.writeFloatLE(globalBounds.minX, 8);
            headerBuffer.writeFloatLE(globalBounds.minY, 12);
            headerBuffer.writeFloatLE(globalBounds.minZ, 16);
            headerBuffer.writeFloatLE(globalBounds.maxX, 20);
            headerBuffer.writeFloatLE(globalBounds.maxY, 24);
            headerBuffer.writeFloatLE(globalBounds.maxZ, 28);
            
            // Convert Float32Array to Buffer for point data (binary, no JSON!)
            const pointDataBuffer = Buffer.from(pointsFloat32.buffer, pointsFloat32.byteOffset, pointsFloat32.byteLength);
            
            // Combine header + data
            const inputBuffer = Buffer.concat([headerBuffer, pointDataBuffer]);
            
            let outputBuffer = Buffer.alloc(0);
            let errorData = '';
            
            pythonProcess.stdout.on('data', (data) => {
              outputBuffer = Buffer.concat([outputBuffer, data]);
            });
            
            pythonProcess.stderr.on('data', (data) => {
              const errorText = data.toString();
              errorData += errorText;
              if (errorText.trim()) {
                console.error('🔧 WebSocket: Python voxel downsampling stderr:', errorText);
              }
            });
            
            pythonProcess.on('error', (error) => {
              console.error('🔧 WebSocket: Python process error:', error);
              ws.send(JSON.stringify({
                type: 'voxel_downsample_python_result',
                requestId,
                success: false,
                error: 'Python process failed to start'
              }));
            });
            
            pythonProcess.on('close', (code) => {
              console.log(`🔧 WebSocket: Python voxel downsampling process closed with code ${code}, outputBuffer.length: ${outputBuffer.length}`);
              
              if (code !== 0) {
                console.error(`🔧 WebSocket: Python process exited with code ${code}`);
                ws.send(JSON.stringify({
                  type: 'voxel_downsample_python_result',
                  requestId,
                  success: false,
                  error: `Python process exited with code ${code}: ${errorData}`
                }));
                return;
              }
              
              try {
                // Read binary output (no JSON parsing!)
                // Binary format: [u32 outputCount][f32* downsampledPoints]
                if (outputBuffer.length < 4) {
                  throw new Error(`Invalid binary output: too short (${outputBuffer.length} bytes, expected at least 4)`);
                }
                
                const outputCount = outputBuffer.readUInt32LE(0);
                const expectedSize = 4 + outputCount * 3 * 4; // 4 bytes header + outputCount * 3 floats * 4 bytes
                
                if (outputBuffer.length < expectedSize) {
                  throw new Error(`Invalid binary output: expected ${expectedSize} bytes, got ${outputBuffer.length}`);
                }
                
                // Extract downsampled points (skip 4-byte header)
                const downsampledPointsBuffer = outputBuffer.slice(4, expectedSize);
                const downsampledPoints = new Float32Array(downsampledPointsBuffer.buffer, downsampledPointsBuffer.byteOffset, outputCount * 3);
                
                const processingTime = Date.now() - startTime;
                
                // Send binary response directly (no JSON conversion overhead!)
                // Format: JSON header with metadata, then binary data
                const responseHeader = {
                  type: 'voxel_downsample_python_result',
                  requestId,
                  success: true,
                  originalCount: pointCount,
                  downsampledCount: outputCount,
                  voxelCount: outputCount,
                  processingTime: processingTime,
                  dataLength: outputCount * 3
                };
                
                // Send header as JSON
                ws.send(JSON.stringify(responseHeader));
                
                // Send binary data directly - use the sliced buffer, not the Float32Array's buffer
                ws.send(downsampledPointsBuffer);
              } catch (parseError) {
                console.error('🔧 WebSocket: Python voxel downsampling binary protocol error:', parseError);
                console.error('🔧 WebSocket: Python voxel downsampling stderr:', errorData);
                console.error('🔧 WebSocket: Python voxel downsampling stdout length:', outputBuffer.length);
                ws.send(JSON.stringify({
                  type: 'voxel_downsample_python_result',
                  requestId,
                  success: false,
                  error: `Binary protocol error: ${parseError.message}`
                }));
              }
            });
            
            // Send binary input to Python process (no JSON serialization!)
            console.log('🔧 WebSocket: Writing', inputBuffer.length, 'bytes to Python voxel downsampling stdin');
            pythonProcess.stdin.write(inputBuffer);
            pythonProcess.stdin.end();
          }
          
          pendingHeader = null; // Reset for next request
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      console.error('Error stack:', error.stack);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('🔧 WebSocket client disconnected');
  });
});

// C++ executables are now in services/tools/ directory

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'],
  credentials: true
}));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Voxel downsampling endpoint
app.post('/api/voxel-downsample', async (req, res) => {
  try {
    const { points, voxelSize, globalBounds } = req.body;
    
    // Validate inputs
    if (!points || !Array.isArray(points)) {
      throw new Error('Invalid points data');
    }
    if (typeof voxelSize !== 'number' || voxelSize <= 0) {
      throw new Error('Invalid voxelSize');
    }
    if (!globalBounds || typeof globalBounds.minX !== 'number') {
      throw new Error('Invalid globalBounds');
    }

    const startTime = Date.now();
    const pointCount = points.length / 3;
    const pointsFloat32 = new Float32Array(points);
    
    // Use C++ backend with binary protocol (no JSON serialization!)
    const cppExecutable = path.join(__dirname, 'services', 'tools', 'voxel_downsample', 'voxel_downsample');
    console.log('🔧 Spawning C++ process:', cppExecutable);
    const cppProcess = spawn(cppExecutable);
    console.log('🔧 C++ process spawned, PID:', cppProcess.pid);
    
    // Create binary header buffer (32 bytes: 4 for uint32 + 7*4 for floats)
    const headerBuffer = Buffer.allocUnsafe(32);
    headerBuffer.writeUInt32LE(pointCount, 0);
    headerBuffer.writeFloatLE(voxelSize, 4);
    headerBuffer.writeFloatLE(globalBounds.minX, 8);
    headerBuffer.writeFloatLE(globalBounds.minY, 12);
    headerBuffer.writeFloatLE(globalBounds.minZ, 16);
    headerBuffer.writeFloatLE(globalBounds.maxX, 20);
    headerBuffer.writeFloatLE(globalBounds.maxY, 24);
    headerBuffer.writeFloatLE(globalBounds.maxZ, 28);
    
    // Convert Float32Array to Buffer for point data (binary, no JSON!)
    const pointDataBuffer = Buffer.from(pointsFloat32.buffer, pointsFloat32.byteOffset, pointsFloat32.byteLength);
    
    // Combine header + data
    const inputBuffer = Buffer.concat([headerBuffer, pointDataBuffer]);
    
    let outputBuffer = Buffer.alloc(0);
    let errorBuffer = '';
    
    cppProcess.stdout.on('data', (data) => {
      outputBuffer = Buffer.concat([outputBuffer, data]);
      console.log('🔧 Received', data.length, 'bytes from stdout, total:', outputBuffer.length);
    });
    
    cppProcess.stderr.on('data', (data) => {
      const errorText = data.toString();
      errorBuffer += errorText;
      if (errorText.trim()) {
        console.error('🔧 C++ stderr:', errorText);
      }
    });
    
    cppProcess.on('error', (error) => {
      console.error('C++ process error:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: 'C++ process failed to start: ' + error.message 
        });
      }
    });
    
    cppProcess.on('close', (code, signal) => {
      console.log(`🔧 C++ process closed with code ${code}, signal ${signal}, outputBuffer.length: ${outputBuffer.length}, errorBuffer length: ${errorBuffer.length}`);
      
      if (code !== 0 || signal !== null) {
        console.error(`C++ process exited with code ${code}, signal ${signal}`);
        console.error('C++ stderr:', errorBuffer);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: `C++ process exited with code ${code}${signal ? ', signal ' + signal : ''}. Stderr: ${errorBuffer || 'none'}` 
          });
        }
        return;
      }
      
      // If process exited successfully but no output, something went wrong
      if (outputBuffer.length === 0) {
        console.error('C++ process exited successfully but produced no output');
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: 'C++ process produced no output. Stderr: ' + (errorBuffer || 'none')
          });
        }
        return;
      }
      
      try {
        // Read binary output (no JSON parsing!)
        // Binary format: [uint32_t outputCount][float* downsampledPoints]
        if (outputBuffer.length < 4) {
          throw new Error(`Invalid binary output: too short (${outputBuffer.length} bytes, expected at least 4)`);
        }
        
        const outputCount = outputBuffer.readUInt32LE(0);
        const expectedSize = 4 + outputCount * 3 * 4; // 4 bytes header + outputCount * 3 floats * 4 bytes
        
        if (outputBuffer.length < expectedSize) {
          throw new Error(`Invalid binary output: expected ${expectedSize} bytes, got ${outputBuffer.length}`);
        }
        
        // Extract downsampled points (skip 4-byte header)
        const downsampledPointsBuffer = outputBuffer.slice(4, expectedSize);
        const downsampledPoints = new Float32Array(downsampledPointsBuffer.buffer, downsampledPointsBuffer.byteOffset, outputCount * 3);
        
        const processingTime = Date.now() - startTime;
        
        console.log(`🔧 Sending success response: ${outputCount} points, ${processingTime}ms`);
        if (!res.headersSent) {
          res.json({
            success: true,
            downsampledPoints: Array.from(downsampledPoints), // Only convert to array for JSON response
            originalCount: pointCount,
            downsampledCount: outputCount,
            voxelCount: outputCount,
            reductionRatio: pointCount / outputCount,
            processingTime: processingTime,
            method: 'Backend C++ (binary protocol)'
          });
        } else {
          console.error('🔧 Response already sent!');
        }
      } catch (parseError) {
        console.error('C++ Binary protocol error:', parseError);
        console.error('C++ stderr:', errorBuffer);
        console.error('C++ stdout length:', outputBuffer.length);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: `Binary protocol error: ${parseError.message}. Stderr: ${errorBuffer}`,
            processingTime: Date.now() - startTime
          });
        }
      }
    });
    
    // Send binary input to C++ process (no JSON serialization!)
    console.log('🔧 Writing', inputBuffer.length, 'bytes to stdin');
    cppProcess.stdin.write(inputBuffer);
    cppProcess.stdin.end();
    console.log('🔧 Stdin closed');
    
  } catch (error) {
    console.error('Voxel downsampling error:', error);
    if (!res.headersSent) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
    }
  }
});

// Point cloud smoothing endpoint for C++ backend processing
app.post('/api/point-smooth', async (req, res) => {
  try {
    const { points, smoothingRadius, iterations } = req.body;
    
    console.log('🔧 Backend: Processing point cloud smoothing request', {
      pointCount: points ? points.length / 3 : 0,
      smoothingRadius,
      iterations
    });
    
    // Validate inputs
    if (!points || !Array.isArray(points)) {
      throw new Error('Invalid points data');
    }
    if (typeof smoothingRadius !== 'number' || smoothingRadius <= 0) {
      throw new Error('Invalid smoothingRadius');
    }
    if (typeof iterations !== 'number' || iterations <= 0) {
      throw new Error('Invalid iterations');
    }

    const startTime = Date.now();
    
    // Use real C++ backend processing for point cloud smoothing
    console.log('🔧 Backend: Using real C++ backend processing for point cloud smoothing');
    
    // Path to the C++ executable
    const cppExecutable = path.join(__dirname, 'services', 'tools', 'point_smooth', 'point_smooth_cpp');
    
    // Prepare input for C++ program
    const pointCount = points.length / 3;
    const input = `${pointCount} ${smoothingRadius} ${iterations}\n`;
    
    // Add point cloud data - optimized with array join (much faster than string concatenation)
    const pointDataArray = [];
    for (let i = 0; i < points.length; i += 3) {
      pointDataArray.push(`${points[i]} ${points[i + 1]} ${points[i + 2]}`);
    }
    
    const fullInput = input + pointDataArray.join('\n') + '\n';
    
    // Execute C++ program
    const cppProcess = spawn(cppExecutable);
    
    let smoothedPoints = [];
    let outputBuffer = '';
    
    cppProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
    });
    
    cppProcess.stdout.on('end', () => {
      console.log('🔧 Backend: C++ stdout complete:', outputBuffer);
      const lines = outputBuffer.trim().split('\n');
      
      if (lines.length >= 2) {
        const pointCount = parseInt(lines[0]);
        const pointsString = lines[1].trim();
        const points = pointsString.split(' ').map(parseFloat).filter(p => !isNaN(p));
        smoothedPoints = points;
        console.log('🔧 Backend: Parsed smoothedPoints:', smoothedPoints.length / 3, 'points');
      }
      
      // Send response after processing stdout
      const processingTime = Date.now() - startTime;
      console.log('🔧 Backend: C++ point cloud smoothing processing completed', {
        processingTime: processingTime + 'ms'
      });
      
      res.json({
        success: true,
        smoothedPoints: smoothedPoints,
        originalCount: pointCount,
        smoothedCount: smoothedPoints.length / 3,
        processingTime: processingTime,
        method: 'Backend C++ (real)'
      });
    });
    
    cppProcess.stderr.on('data', (data) => {
      console.error('C++ process error:', data.toString());
    });
    
    // Handle process errors
    cppProcess.on('error', (error) => {
      console.error('C++ process error:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: 'C++ process failed to start' 
        });
      }
    });
    
    cppProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`C++ process exited with code ${code}`);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: `C++ process exited with code ${code}` 
          });
        }
      }
    });
    
    // Send input to C++ process
    console.log('🔧 Backend: Sending input to C++ process...');
    cppProcess.stdin.write(fullInput);
    cppProcess.stdin.end();
    console.log('🔧 Backend: Input sent, waiting for response...');
    
  } catch (error) {
    console.error('Point cloud smoothing error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Voxel debug endpoint for C++ backend processing
app.post('/api/voxel-debug', async (req, res) => {
  try {
    const { pointCloudData, voxelSize, globalBounds } = req.body;
    
    console.log('🔧 Backend: Processing voxel debug request', {
      pointCount: pointCloudData ? pointCloudData.length / 3 : 0,
      voxelSize,
      bounds: globalBounds
    });
    
    // Validate inputs
    if (!pointCloudData || !Array.isArray(pointCloudData)) {
      throw new Error('Invalid pointCloudData');
    }
    if (typeof voxelSize !== 'number' || voxelSize <= 0) {
      throw new Error('Invalid voxelSize');
    }
    if (!globalBounds || typeof globalBounds.minX !== 'number') {
      throw new Error('Invalid globalBounds');
    }

    const startTime = Date.now();
    const pointCount = pointCloudData.length / 3;
    const pointsFloat32 = new Float32Array(pointCloudData);
    
    // Use C++ backend with binary protocol (no JSON/text serialization!)
    const cppExecutable = path.join(__dirname, 'services', 'tools', 'voxel_debug', 'voxel_debug');
    console.log('🔧 Spawning C++ voxel debug process:', cppExecutable);
    const cppProcess = spawn(cppExecutable);
    console.log('🔧 C++ voxel debug process spawned, PID:', cppProcess.pid);
    
    // Create binary header buffer (32 bytes: 4 for uint32 + 7*4 for floats)
    const headerBuffer = Buffer.allocUnsafe(32);
    headerBuffer.writeUInt32LE(pointCount, 0);
    headerBuffer.writeFloatLE(voxelSize, 4);
    headerBuffer.writeFloatLE(globalBounds.minX, 8);
    headerBuffer.writeFloatLE(globalBounds.minY, 12);
    headerBuffer.writeFloatLE(globalBounds.minZ, 16);
    headerBuffer.writeFloatLE(globalBounds.maxX, 20);
    headerBuffer.writeFloatLE(globalBounds.maxY, 24);
    headerBuffer.writeFloatLE(globalBounds.maxZ, 28);
    
    // Convert Float32Array to Buffer for point data (binary, no text!)
    const pointDataBuffer = Buffer.from(pointsFloat32.buffer, pointsFloat32.byteOffset, pointsFloat32.byteLength);
    
    // Combine header + data
    const inputBuffer = Buffer.concat([headerBuffer, pointDataBuffer]);
    
    let outputBuffer = Buffer.alloc(0);
    let errorBuffer = '';
    
    cppProcess.stdout.on('data', (data) => {
      outputBuffer = Buffer.concat([outputBuffer, data]);
    });
    
    cppProcess.stderr.on('data', (data) => {
      const errorText = data.toString();
      errorBuffer += errorText;
      if (errorText.trim()) {
        console.error('🔧 C++ voxel debug stderr:', errorText);
      }
    });
    
    cppProcess.on('error', (error) => {
      console.error('C++ voxel debug process error:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: 'C++ process failed to start' 
        });
      }
    });
    
    cppProcess.on('close', (code) => {
      console.log(`🔧 C++ voxel debug process closed with code ${code}, outputBuffer.length: ${outputBuffer.length}`);
      
      if (code !== 0) {
        console.error(`C++ voxel debug process exited with code ${code}`);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: `C++ process exited with code ${code}. Stderr: ${errorBuffer}` 
          });
        }
        return;
      }
      
      try {
        // Read binary output (no text parsing!)
        // Binary format: [uint32_t voxelCount][float* voxelGridPositions]
        if (outputBuffer.length < 4) {
          throw new Error(`Invalid binary output: too short (${outputBuffer.length} bytes, expected at least 4)`);
        }
        
        const voxelCount = outputBuffer.readUInt32LE(0);
        const expectedSize = 4 + voxelCount * 3 * 4; // 4 bytes header + voxelCount * 3 floats * 4 bytes
        
        if (outputBuffer.length < expectedSize) {
          throw new Error(`Invalid binary output: expected ${expectedSize} bytes, got ${outputBuffer.length}`);
        }
        
        // Extract voxel grid positions (skip 4-byte header)
        const voxelGridPositionsBuffer = outputBuffer.slice(4, expectedSize);
        const voxelGridPositions = new Float32Array(voxelGridPositionsBuffer.buffer, voxelGridPositionsBuffer.byteOffset, voxelCount * 3);
        
        const processingTime = Date.now() - startTime;
        
        console.log(`🔧 C++ voxel debug success: ${voxelCount} voxels, ${processingTime}ms`);
        if (!res.headersSent) {
          res.json({
            success: true,
            voxelCenters: Array.from(voxelGridPositions), // Only convert to array for JSON response
            voxelCount: voxelCount,
            originalCount: pointCount,
            processingTime: processingTime,
            method: 'Backend C++ (binary protocol)'
          });
        } else {
          console.error('🔧 Response already sent!');
        }
      } catch (parseError) {
        console.error('C++ voxel debug binary protocol error:', parseError);
        console.error('C++ voxel debug stderr:', errorBuffer);
        console.error('C++ voxel debug stdout length:', outputBuffer.length);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: `Binary protocol error: ${parseError.message}. Stderr: ${errorBuffer}`,
            processingTime: Date.now() - startTime
          });
        }
      }
    });
    
    // Send binary input to C++ process (no text serialization!)
    console.log('🔧 Writing', inputBuffer.length, 'bytes to C++ voxel debug stdin');
    cppProcess.stdin.write(inputBuffer);
    cppProcess.stdin.end();
    console.log('🔧 C++ voxel debug stdin closed');
    
  } catch (error) {
    console.error('Voxel debug error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Rust Backend Endpoints

// Voxel downsampling endpoint for Rust backend processing
app.post('/api/voxel-downsample-rust', async (req, res) => {
  try {
    const { pointCloudData, voxelSize, globalBounds } = req.body;
    
    console.log('🔧 Backend: Processing Rust voxel downsampling request', {
      pointCount: pointCloudData ? pointCloudData.length / 3 : 0,
      voxelSize,
      bounds: globalBounds
    });
    
    // Validate inputs
    if (!pointCloudData || !Array.isArray(pointCloudData)) {
      throw new Error('Invalid pointCloudData');
    }
    if (typeof voxelSize !== 'number' || voxelSize <= 0) {
      throw new Error('Invalid voxelSize');
    }
    if (!globalBounds || typeof globalBounds.minX !== 'number') {
      throw new Error('Invalid globalBounds');
    }

    const startTime = Date.now();
    
    // Use Rust backend processing
    console.log('🔧 Backend: Using Rust backend processing for voxel downsampling');
    
    // Path to the Rust executable
    const rustExecutable = path.join(__dirname, 'services', 'tools', 'target', 'release', 'voxel_downsample_rust');
    
    // Prepare input for Rust program
    const input = {
      point_cloud_data: pointCloudData,
      voxel_size: voxelSize,
      global_bounds: {
        min_x: globalBounds.minX,
        min_y: globalBounds.minY,
        min_z: globalBounds.minZ,
        max_x: globalBounds.maxX,
        max_y: globalBounds.maxY,
        max_z: globalBounds.maxZ
      }
    };
    
    const inputJson = JSON.stringify(input);
    
    // Spawn Rust process
    const rustProcess = spawn(rustExecutable);
    
    let outputData = '';
    let errorData = '';
    
    rustProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });
    
    rustProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });
    
    rustProcess.on('error', (error) => {
      console.error('Rust process error:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: 'Rust process failed to start' 
        });
      }
    });
    
    rustProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Rust process exited with code ${code}`);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: `Rust process exited with code ${code}: ${errorData}` 
          });
        }
        return;
      }
      
      try {
        const result = JSON.parse(outputData);
        const processingTime = Date.now() - startTime;
        
        console.log('🔧 Backend: Rust voxel downsampling completed', {
          originalCount: result.original_count,
          downsampledCount: result.downsampled_count,
          processingTime: result.processing_time,
          totalTime: processingTime
        });
        
        res.json({
          success: true,
          downsampledPoints: result.downsampled_points,
          originalCount: result.original_count,
          downsampledCount: result.downsampled_count,
          voxelCount: result.voxel_count || result.downsampled_count,  // Use voxel_count if available, fallback to downsampled_count
          processingTime: result.processing_time
        });
      } catch (parseError) {
        console.error('Failed to parse Rust output:', parseError);
        console.error('Raw output:', outputData);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: 'Failed to parse Rust output' 
          });
        }
      }
    });
    
    // Send input to Rust process
    rustProcess.stdin.write(inputJson);
    rustProcess.stdin.end();
    
  } catch (error) {
    console.error('Rust voxel downsampling error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Point cloud smoothing endpoint for Rust backend processing
app.post('/api/point-smooth-rust', async (req, res) => {
  try {
    const { pointCloudData, smoothingRadius, iterations } = req.body;
    
    console.log('🔧 Backend: Processing Rust point cloud smoothing request', {
      pointCount: pointCloudData ? pointCloudData.length / 3 : 0,
      smoothingRadius,
      iterations
    });
    
    // Validate inputs
    if (!pointCloudData || !Array.isArray(pointCloudData)) {
      throw new Error('Invalid pointCloudData');
    }
    if (typeof smoothingRadius !== 'number' || smoothingRadius <= 0) {
      throw new Error('Invalid smoothingRadius');
    }
    if (typeof iterations !== 'number' || iterations <= 0) {
      throw new Error('Invalid iterations');
    }

    const startTime = Date.now();
    
    // Use Rust backend processing
    console.log('🔧 Backend: Using Rust backend processing for point cloud smoothing');
    
    // Path to the Rust executable
    const rustExecutable = path.join(__dirname, 'services', 'tools', 'point_smooth', 'point_smooth_rust');
    
    // Prepare input for Rust program
    const input = {
      point_cloud_data: pointCloudData,
      smoothing_radius: smoothingRadius,
      iterations: iterations
    };
    
    const inputJson = JSON.stringify(input);
    
    // Spawn Rust process
    const rustProcess = spawn(rustExecutable);
    
    let outputData = '';
    let errorData = '';
    
    rustProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });
    
    rustProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });
    
    rustProcess.on('error', (error) => {
      console.error('Rust process error:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: 'Rust process failed to start' 
        });
      }
    });
    
    rustProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Rust process exited with code ${code}`);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: `Rust process exited with code ${code}: ${errorData}` 
          });
        }
        return;
      }
      
      try {
        const result = JSON.parse(outputData);
        const processingTime = Date.now() - startTime;
        
        console.log('🔧 Backend: Rust point cloud smoothing completed', {
          originalCount: result.original_count,
          smoothedCount: result.smoothed_count,
          processingTime: result.processing_time,
          totalTime: processingTime
        });
        
        res.json({
          success: true,
          smoothedPoints: result.smoothed_points,
          originalCount: result.original_count,
          smoothedCount: result.smoothed_count,
          processingTime: result.processing_time
        });
      } catch (parseError) {
        console.error('Failed to parse Rust output:', parseError);
        console.error('Raw output:', outputData);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: 'Failed to parse Rust output' 
          });
        }
      }
    });
    
    // Send input to Rust process
    rustProcess.stdin.write(inputJson);
    rustProcess.stdin.end();
    
  } catch (error) {
    console.error('Rust point cloud smoothing error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Voxel debug endpoint for Rust backend processing
app.post('/api/voxel-debug-rust', async (req, res) => {
  try {
    const { pointCloudData, voxelSize, globalBounds } = req.body;
    
    console.log('🔧 Backend: Processing Rust voxel debug request', {
      pointCount: pointCloudData ? pointCloudData.length / 3 : 0,
      voxelSize,
      bounds: globalBounds
    });
    
    // Validate inputs
    if (!pointCloudData || !Array.isArray(pointCloudData)) {
      throw new Error('Invalid pointCloudData');
    }
    if (typeof voxelSize !== 'number' || voxelSize <= 0) {
      throw new Error('Invalid voxelSize');
    }
    if (!globalBounds || typeof globalBounds.minX !== 'number') {
      throw new Error('Invalid globalBounds');
    }

    const startTime = Date.now();
    const pointCount = pointCloudData.length / 3;
    const pointsFloat32 = new Float32Array(pointCloudData);
    
    // Use Rust backend with binary protocol (no JSON serialization!)
    const rustExecutable = path.join(__dirname, 'services', 'tools', 'voxel_debug', 'voxel_debug_rust');
    console.log('🔧 Spawning Rust voxel debug process:', rustExecutable);
    const rustProcess = spawn(rustExecutable);
    console.log('🔧 Rust voxel debug process spawned, PID:', rustProcess.pid);
    
    // Create binary header buffer (32 bytes: 4 for u32 + 7*4 for floats)
    const headerBuffer = Buffer.allocUnsafe(32);
    headerBuffer.writeUInt32LE(pointCount, 0);
    headerBuffer.writeFloatLE(voxelSize, 4);
    headerBuffer.writeFloatLE(globalBounds.minX, 8);
    headerBuffer.writeFloatLE(globalBounds.minY, 12);
    headerBuffer.writeFloatLE(globalBounds.minZ, 16);
    headerBuffer.writeFloatLE(globalBounds.maxX, 20);
    headerBuffer.writeFloatLE(globalBounds.maxY, 24);
    headerBuffer.writeFloatLE(globalBounds.maxZ, 28);
    
    // Convert Float32Array to Buffer for point data (binary, no JSON!)
    const pointDataBuffer = Buffer.from(pointsFloat32.buffer, pointsFloat32.byteOffset, pointsFloat32.byteLength);
    
    // Combine header + data
    const inputBuffer = Buffer.concat([headerBuffer, pointDataBuffer]);
    
    let outputBuffer = Buffer.alloc(0);
    let errorBuffer = '';
    
    rustProcess.stdout.on('data', (data) => {
      outputBuffer = Buffer.concat([outputBuffer, data]);
    });
    
    rustProcess.stderr.on('data', (data) => {
      const errorText = data.toString();
      errorBuffer += errorText;
      if (errorText.trim()) {
        console.error('🔧 Rust voxel debug stderr:', errorText);
      }
    });
    
    rustProcess.on('error', (error) => {
      console.error('Rust voxel debug process error:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: 'Rust process failed to start' 
        });
      }
    });
    
    rustProcess.on('close', (code) => {
      console.log(`🔧 Rust voxel debug process closed with code ${code}, outputBuffer.length: ${outputBuffer.length}`);
      
      if (code !== 0) {
        console.error(`Rust voxel debug process exited with code ${code}`);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: `Rust process exited with code ${code}. Stderr: ${errorBuffer}` 
          });
        }
        return;
      }
      
      try {
        // Read binary output (no JSON parsing!)
        // Binary format: [u32 voxelCount][f32* voxelGridPositions]
        if (outputBuffer.length < 4) {
          throw new Error(`Invalid binary output: too short (${outputBuffer.length} bytes, expected at least 4)`);
        }
        
        const voxelCount = outputBuffer.readUInt32LE(0);
        const expectedSize = 4 + voxelCount * 3 * 4; // 4 bytes header + voxelCount * 3 floats * 4 bytes
        
        if (outputBuffer.length < expectedSize) {
          throw new Error(`Invalid binary output: expected ${expectedSize} bytes, got ${outputBuffer.length}`);
        }
        
        // Extract voxel grid positions (skip 4-byte header)
        const voxelGridPositionsBuffer = outputBuffer.slice(4, expectedSize);
        const voxelGridPositions = new Float32Array(voxelGridPositionsBuffer.buffer, voxelGridPositionsBuffer.byteOffset, voxelCount * 3);
        
        const processingTime = Date.now() - startTime;
        
        console.log(`🔧 Rust voxel debug success: ${voxelCount} voxels, ${processingTime}ms`);
        if (!res.headersSent) {
          res.json({
            success: true,
            voxelCenters: Array.from(voxelGridPositions), // Only convert to array for JSON response
            voxelCount: voxelCount,
            originalCount: pointCount,
            processingTime: processingTime,
            method: 'Backend Rust (binary protocol)'
          });
        } else {
          console.error('🔧 Response already sent!');
        }
      } catch (parseError) {
        console.error('Rust voxel debug binary protocol error:', parseError);
        console.error('Rust voxel debug stderr:', errorBuffer);
        console.error('Rust voxel debug stdout length:', outputBuffer.length);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: `Binary protocol error: ${parseError.message}. Stderr: ${errorBuffer}`,
            processingTime: Date.now() - startTime
          });
        }
      }
    });
    
    // Send binary input to Rust process (no JSON serialization!)
    console.log('🔧 Writing', inputBuffer.length, 'bytes to Rust voxel debug stdin');
    rustProcess.stdin.write(inputBuffer);
    rustProcess.stdin.end();
    console.log('🔧 Rust voxel debug stdin closed');
    
  } catch (error) {
    console.error('Rust voxel debug error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Point Cloud Backend'
  });
});


// Start server
server.listen(PORT, () => {
  console.log(`🔧 Backend server running on port ${PORT}`);
  console.log(`🔧 WebSocket server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Voxel downsampling: http://localhost:${PORT}/api/voxel-downsample`);
  console.log(`Point smoothing: http://localhost:${PORT}/api/point-smooth`);
  console.log(`Voxel debug: http://localhost:${PORT}/api/voxel-debug`);
});

// Handle graceful shutdown on Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🔧 Received SIGINT (Ctrl+C). Shutting down gracefully...');
  
  // Close the server
  server.close(() => {
    console.log('🔧 HTTP server closed');
    
    // Close WebSocket server
    if (wss) {
      wss.close(() => {
        console.log('🔧 WebSocket server closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
  
  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.log('🔧 Force exit after timeout');
    process.exit(1);
  }, 5000);
});

// Handle uncaught exceptions to prevent server crashes
process.on('uncaughtException', (error) => {
  console.error('🔧 Uncaught Exception:', error);
  console.error('🔧 Stack:', error.stack);
  // Don't exit - log and continue (server should stay up)
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔧 Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - log and continue (server should stay up)
});

// Handle graceful shutdown on SIGTERM
process.on('SIGTERM', () => {
  console.log('\n🔧 Received SIGTERM. Shutting down gracefully...');
  
  server.close(() => {
    console.log('🔧 HTTP server closed');
    
    if (wss) {
      wss.close(() => {
        console.log('🔧 WebSocket server closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
  
  setTimeout(() => {
    console.log('🔧 Force exit after timeout');
    process.exit(1);
  }, 5000);
});

// Handle port conflicts gracefully
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use. Backend server may already be running.`);
    console.log(`If you need to restart, kill the existing process first.`);
    process.exit(0); // Exit gracefully instead of crashing
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});
