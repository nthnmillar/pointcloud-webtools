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
          
          if (type === 'voxel_downsample') {
            // Handle C++ voxel downsampling
            const cppProcess = await voxelDownsamplePool.getProcess();
          
          // Prepare input for C++ program
          const pointCount = points.length / 3;
          const input = `${pointCount} ${voxelSize} ${globalBounds.minX} ${globalBounds.minY} ${globalBounds.minZ} ${globalBounds.maxX} ${globalBounds.maxY} ${globalBounds.maxZ}\n`;
          
          // Add point cloud data - optimized with array join
          const pointDataArray = [];
          for (let i = 0; i < points.length; i += 3) {
            pointDataArray.push(`${points[i]} ${points[i + 1]} ${points[i + 2]}`);
          }
          
          const fullInput = input + pointDataArray.join('\n') + '\n';
          
          let outputBuffer = '';
          
          cppProcess.stdout.on('data', (data) => {
            outputBuffer += data.toString();
          });
          
          cppProcess.stdout.on('end', () => {
            const lines = outputBuffer.trim().split('\n');
            
            let voxelCount = 0;
            let originalCount = 0;
            let downsampledCount = 0;
            let downsampledPoints = [];
            
            if (lines.length >= 4) {
              voxelCount = parseInt(lines[0]);
              originalCount = parseInt(lines[1]);
              downsampledCount = parseInt(lines[2]);
              const pointsString = lines[3].trim();
              const points = pointsString.split(' ').map(parseFloat).filter(p => !isNaN(p));
              downsampledPoints = points;
            }
            
            const processingTime = Date.now() - startTime;
            
            // Release process back to pool
            voxelDownsamplePool.releaseProcess(cppProcess);
            
            // Send result back via WebSocket
            ws.send(JSON.stringify({
              type: 'voxel_downsample_result',
              requestId,
              success: true,
              downsampledPoints,
              originalCount,
              downsampledCount,
              voxelCount,
              processingTime
            }));
          });
          
          cppProcess.stderr.on('data', (data) => {
            console.error('C++ process error:', data.toString());
          });
          
          cppProcess.on('error', (error) => {
            console.error('C++ process error:', error);
            voxelDownsamplePool.releaseProcess(cppProcess);
            ws.send(JSON.stringify({
              type: 'voxel_downsample_result',
              requestId,
              success: false,
              error: 'C++ process failed to start'
            }));
          });
          
          cppProcess.on('close', (code) => {
            if (code !== 0) {
              console.error(`C++ process exited with code ${code}`);
              voxelDownsamplePool.releaseProcess(cppProcess);
              ws.send(JSON.stringify({
                type: 'voxel_downsample_result',
                requestId,
                success: false,
                error: `C++ process exited with code ${code}`
              }));
            }
          });
          
          // Send input to C++ process
          cppProcess.stdin.write(fullInput);
          cppProcess.stdin.end();
          
          } else if (type === 'voxel_downsample_rust') {
            // Handle Rust voxel downsampling
            const rustExecutable = path.join(__dirname, 'services', 'tools', 'voxel_downsample', 'voxel_downsample_rust');
            
            let rustProcess;
            try {
              rustProcess = spawn(rustExecutable);
            } catch (spawnError) {
              console.error('🔧 WebSocket: Failed to spawn Rust process:', spawnError);
              ws.send(JSON.stringify({
                type: 'voxel_downsample_rust_result',
                requestId,
                success: false,
                error: 'Failed to spawn Rust process: ' + spawnError.message
              }));
              return;
            }
            
            // Prepare input for Rust program
            const input = {
              point_cloud_data: Array.from(points),
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
                  error: `Rust process exited with code ${code}: ${errorData}`
                }));
                return;
              }
              
              try {
                const result = JSON.parse(outputData);
                const processingTime = Date.now() - startTime;
                
                ws.send(JSON.stringify({
                  type: 'voxel_downsample_rust_result',
                  requestId,
                  success: true,
                  data: {
                    downsampledPoints: result.downsampled_points,
                    originalCount: result.original_count,
                    downsampledCount: result.downsampled_count,
                    processingTime: result.processing_time
                  }
                }));
              } catch (parseError) {
                console.error('Failed to parse Rust output:', parseError);
                ws.send(JSON.stringify({
                  type: 'voxel_downsample_rust_result',
                  requestId,
                  success: false,
                  error: 'Failed to parse Rust output'
                }));
              }
            });
            
            // Send input to Rust process
            rustProcess.stdin.write(JSON.stringify(input));
            rustProcess.stdin.end();
            
          } else if (type === 'point_smooth_rust') {
            // Handle Rust point cloud smoothing
            const rustExecutable = path.join(__dirname, 'services', 'tools', 'point_smooth', 'point_smooth_rust');
            console.log('🔧 Rust point smooth executable:', rustExecutable);
            const rustProcess = spawn(rustExecutable);
            
            // Prepare input for Rust program
            const input = {
              point_cloud_data: Array.from(points),
              smoothing_radius: smoothingRadius,
              iterations: iterations
            };
            console.log('🔧 Rust point smooth input:', { pointCount: points.length / 3, smoothingRadius, iterations });
            
            let outputData = '';
            let errorData = '';
            
            rustProcess.stdout.on('data', (data) => {
              console.log('🔧 Rust point smooth stdout:', data.toString());
              outputData += data.toString();
            });
            
            rustProcess.stderr.on('data', (data) => {
              console.log('🔧 Rust point smooth stderr:', data.toString());
              errorData += data.toString();
            });
            
            rustProcess.on('error', (error) => {
              console.error('Rust process error:', error);
              ws.send(JSON.stringify({
                type: 'point_smooth_rust_result',
                requestId,
                success: false,
                error: 'Rust process failed to start'
              }));
            });
            
            rustProcess.on('close', (code) => {
              if (code !== 0) {
                console.error(`Rust process exited with code ${code}`);
                ws.send(JSON.stringify({
                  type: 'point_smooth_rust_result',
                  requestId,
                  success: false,
                  error: `Rust process exited with code ${code}: ${errorData}`
                }));
                return;
              }
              
              try {
                const result = JSON.parse(outputData);
                const processingTime = Date.now() - startTime;
                
                ws.send(JSON.stringify({
                  type: 'point_smooth_rust_result',
                  requestId,
                  success: true,
                  data: {
                    smoothedPoints: result.smoothed_points,
                    originalCount: result.original_count,
                    smoothedCount: result.smoothed_count,
                    processingTime: result.processing_time,
                    smoothingRadius: result.smoothing_radius,
                    iterations: result.iterations
                  }
                }));
              } catch (parseError) {
                console.error('Failed to parse Rust output:', parseError);
                ws.send(JSON.stringify({
                  type: 'point_smooth_rust_result',
                  requestId,
                  success: false,
                  error: 'Failed to parse Rust output'
                }));
              }
            });
            
            // Send input to Rust process
            rustProcess.stdin.write(JSON.stringify(input));
            rustProcess.stdin.end();
            
          } else if (type === 'point_smooth_cpp') {
            // Handle C++ point cloud smoothing
            const cppExecutable = path.join(__dirname, 'services', 'tools', 'point_smooth', 'point_smooth_cpp');
            const cppProcess = spawn(cppExecutable);
            
            // Prepare input for C++ program
            const input = {
              point_cloud_data: Array.from(points),
              smoothing_radius: smoothingRadius,
              iterations: iterations
            };
            
            let outputData = '';
            let errorData = '';
            
            cppProcess.stdout.on('data', (data) => {
              outputData += data.toString();
            });
            
            cppProcess.stderr.on('data', (data) => {
              errorData += data.toString();
            });
            
            cppProcess.on('error', (error) => {
              console.error('C++ process error:', error);
              ws.send(JSON.stringify({
                type: 'point_smooth_cpp_result',
                requestId,
                success: false,
                error: 'C++ process failed to start'
              }));
            });
            
            cppProcess.on('close', (code) => {
              if (code !== 0) {
                console.error(`C++ process exited with code ${code}`);
                ws.send(JSON.stringify({
                  type: 'point_smooth_cpp_result',
                  requestId,
                  success: false,
                  error: `C++ process exited with code ${code}: ${errorData}`
                }));
                return;
              }
              
              try {
                const result = JSON.parse(outputData);
                const processingTime = Date.now() - startTime;
                
                ws.send(JSON.stringify({
                  type: 'point_smooth_cpp_result',
                  requestId,
                  success: true,
                  data: {
                    smoothedPoints: result.smoothed_points,
                    originalCount: result.original_count,
                    smoothedCount: result.smoothed_count,
                    processingTime: result.processing_time,
                    smoothingRadius: result.smoothing_radius,
                    iterations: result.iterations
                  }
                }));
              } catch (parseError) {
                console.error('Failed to parse C++ output:', parseError);
                ws.send(JSON.stringify({
                  type: 'point_smooth_cpp_result',
                  requestId,
                  success: false,
                  error: 'Failed to parse C++ output'
                }));
              }
            });
            
            // Send input to C++ process
            cppProcess.stdin.write(JSON.stringify(input));
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
            
            // Prepare input for Rust program
            const input = {
              point_cloud_data: Array.from(points),
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
            
            console.log('🔧 WebSocket: Rust voxel debug input:', {
              pointCount: points.length / 3,
              voxelSize: voxelSize,
              globalBounds: globalBounds
            });
            
            let outputData = '';
            let errorData = '';

            rustProcess.stdout.on('data', (data) => {
              console.log('🔧 WebSocket: Rust voxel debug stdout data:', data.toString());
              outputData += data.toString();
            });

            rustProcess.stderr.on('data', (data) => {
              console.log('🔧 WebSocket: Rust voxel debug stderr data:', data.toString());
              errorData += data.toString();
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
              console.log('🔧 WebSocket: Rust voxel debug process closed with code:', code);
              console.log('🔧 WebSocket: Rust voxel debug outputData:', outputData);
              console.log('🔧 WebSocket: Rust voxel debug errorData:', errorData);
              
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
                console.log('🔧 WebSocket: Parsing Rust voxel debug output:', outputData);
                const result = JSON.parse(outputData);
                const processingTime = Date.now() - startTime;

                console.log('🔧 WebSocket: Rust voxel debug result:', result);

                ws.send(JSON.stringify({
                  type: 'voxel_debug_rust_result',
                  requestId,
                  success: true,
                  data: {
                    voxelGridPositions: result.voxel_grid_positions,
                    voxelCount: result.voxel_count,
                    processingTime: result.processing_time
                  }
                }));
              } catch (parseError) {
                console.error('🔧 WebSocket: Failed to parse Rust voxel debug output:', parseError);
                console.error('🔧 WebSocket: Raw output:', outputData);
                ws.send(JSON.stringify({
                  type: 'voxel_debug_rust_result',
                  requestId,
                  success: false,
                  error: 'Failed to parse Rust output'
                }));
              }
            });
            
            // Send input to Rust process
            const inputJson = JSON.stringify(input);
            console.log('🔧 WebSocket: Sending input to Rust voxel debug process:', inputJson.substring(0, 200) + '...');
            rustProcess.stdin.write(inputJson);
            rustProcess.stdin.end();
          } else if (type === 'voxel_debug_python') {
            // Handle Python voxel debug
            console.log('🔧 WebSocket: Starting Python voxel debug process');
            console.log('🔧 WebSocket: Processing Python BE request with type:', type);
            console.log('🔧 WebSocket: Python globalBounds:', globalBounds);
            const pythonExecutable = path.join(__dirname, 'services', 'tools', 'voxel_debug', 'voxel_debug_python.py');
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
            
            let outputData = '';
            let errorData = '';
            
            pythonProcess.stdout.on('data', (data) => {
              outputData += data.toString();
            });
            
            pythonProcess.stderr.on('data', (data) => {
              errorData += data.toString();
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
                // Parse JSON result from stdout (like Rust BE)
                const result = JSON.parse(outputData);
                const processingTime = Date.now() - startTime;
                
                if (result.success) {
                  console.log('🔧 Python: Voxel debug result success, voxel_count:', result.voxel_count);
                  console.log('🔧 Python: Result data:', result);
                  
                  ws.send(JSON.stringify({
                    type: 'voxel_debug_python_result',
                    requestId,
                    success: true,
                    data: {
                      voxelGridPositions: result.voxel_grid_positions,
                      voxelCount: result.voxel_count,
                      processingTime: result.processing_time
                    }
                  }));
                } else {
                  ws.send(JSON.stringify({
                    type: 'voxel_debug_python_result',
                    requestId,
                    success: false,
                    error: result.error || 'Python processing failed'
                  }));
                }
              } catch (parseError) {
                console.error('🔧 WebSocket: Failed to parse Python output:', parseError);
                console.error('🔧 WebSocket: Raw output (stdout):', outputData);
                console.error('🔧 WebSocket: Raw error (stderr):', errorData);
                ws.send(JSON.stringify({
                  type: 'voxel_debug_python_result',
                  requestId,
                  success: false,
                  error: 'Failed to parse Python output'
                }));
              }
            });
            
            // Send JSON input to Python process (like Rust BE)
            const input = {
              point_cloud_data: Array.from(points),
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
            
            console.log('🔧 Python: Sending JSON input:', JSON.stringify(input).substring(0, 200) + '...');
            pythonProcess.stdin.write(JSON.stringify(input));
            pythonProcess.stdin.end();
          } else if (type === 'voxel_downsample_python') {
            // Handle Python voxel downsampling
            console.log('🔧 WebSocket: Starting Python voxel downsampling process');
            console.log('🔧 WebSocket: Processing Python BE request with type:', type);
            console.log('🔧 WebSocket: Python globalBounds:', globalBounds);
            const pythonExecutable = path.join(__dirname, 'services', 'tools', 'voxel_downsample', 'voxel_downsample_python.py');
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
            
            let outputData = '';
            let errorData = '';
            
            pythonProcess.stdout.on('data', (data) => {
              outputData += data.toString();
            });
            
            pythonProcess.stderr.on('data', (data) => {
              errorData += data.toString();
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
                // Parse JSON result from stdout (like Rust BE)
                const result = JSON.parse(outputData);
                const processingTime = Date.now() - startTime;
                
                if (result.success) {
                  console.log('🔧 Python: Result success, downsampled_points length:', result.downsampled_points.length);
                  console.log('🔧 Python: Result data:', result);
                  
                  ws.send(JSON.stringify({
                    type: 'voxel_downsample_python_result',
                    requestId,
                    success: true,
                    data: {
                      downsampledPoints: result.downsampled_points,
                      originalCount: result.original_count,
                      downsampledCount: result.downsampled_count,
                      processingTime: result.processing_time,
                      voxelSize: result.voxel_size,
                      voxelCount: result.voxel_count
                    }
                  }));
                } else {
                  ws.send(JSON.stringify({
                    type: 'voxel_downsample_python_result',
                    requestId,
                    success: false,
                    error: result.error || 'Python processing failed'
                  }));
                }
              } catch (parseError) {
                console.error('🔧 WebSocket: Failed to parse Python output:', parseError);
                console.error('🔧 WebSocket: Raw output (stdout):', outputData);
                console.error('🔧 WebSocket: Raw error (stderr):', errorData);
                ws.send(JSON.stringify({
                  type: 'voxel_downsample_python_result',
                  requestId,
                  success: false,
                  error: 'Failed to parse Python output'
                }));
              }
            });
            
            // Send JSON input to Python process (like Rust BE)
            const input = {
              point_cloud_data: Array.from(points),
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
            
            console.log('🔧 Python: Sending JSON input:', JSON.stringify(input).substring(0, 200) + '...');
            pythonProcess.stdin.write(JSON.stringify(input));
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
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

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
    
    // Use real C++ backend processing for voxel downsampling
    console.log('🔧 Backend: Using real C++ backend processing for voxel downsampling');
    
    // Path to the C++ executable
    const cppExecutable = path.join(__dirname, 'services', 'tools', 'voxel_downsample', 'voxel_downsample');
    
    // Prepare input for C++ program
    const pointCount = points.length / 3;
    const input = `${pointCount} ${voxelSize} ${globalBounds.minX} ${globalBounds.minY} ${globalBounds.minZ} ${globalBounds.maxX} ${globalBounds.maxY} ${globalBounds.maxZ}\n`;
    
    // Add point cloud data - optimized with array join (much faster than string concatenation)
    const pointDataArray = [];
    for (let i = 0; i < points.length; i += 3) {
      pointDataArray.push(`${points[i]} ${points[i + 1]} ${points[i + 2]}`);
    }
    
    const fullInput = input + pointDataArray.join('\n') + '\n';
    
    // Get process from pool
    const cppProcess = await voxelDownsamplePool.getProcess();
    
    let voxelCount = 0;
    let originalCount = 0;
    let downsampledCount = 0;
    let downsampledPoints = [];
    
    let outputBuffer = '';
    
    cppProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
    });
    
    cppProcess.stdout.on('end', () => {
      console.log('🔧 Backend: C++ stdout complete:', outputBuffer);
      const lines = outputBuffer.trim().split('\n');
      
      if (lines.length >= 4) {
        voxelCount = parseInt(lines[0]);
        originalCount = parseInt(lines[1]);
        downsampledCount = parseInt(lines[2]);
        const pointsString = lines[3].trim();
        const points = pointsString.split(' ').map(parseFloat).filter(p => !isNaN(p));
        downsampledPoints = points;
        console.log('🔧 Backend: Parsed downsampledPoints:', downsampledPoints.length / 3, 'points');
      }
      
      // Send response after processing stdout
      const processingTime = Date.now() - startTime;
      const reductionRatio = originalCount / downsampledCount;
      
      console.log('🔧 Backend: C++ voxel downsampling processing completed', {
        voxelCount: voxelCount,
        processingTime: processingTime + 'ms'
      });
      
      // Release process back to pool
      voxelDownsamplePool.releaseProcess(cppProcess);
      
      res.json({
        success: true,
        downsampledPoints: downsampledPoints,
        originalCount: originalCount,
        downsampledCount: downsampledCount,
        voxelCount: voxelCount,
        reductionRatio: reductionRatio,
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
      voxelDownsamplePool.releaseProcess(cppProcess);
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
        voxelDownsamplePool.releaseProcess(cppProcess);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: `C++ process exited with code ${code}` 
          });
        }
      }
    });
    
    // Send input to C++ process
    cppProcess.stdin.write(fullInput);
    cppProcess.stdin.end();
    
  } catch (error) {
    console.error('Voxel downsampling error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
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
    
    // Use real C++ backend processing
    console.log('🔧 Backend: Using real C++ backend processing for voxel debug');
    
    // Path to the C++ executable
    const cppExecutable = path.join(__dirname, 'services', 'tools', 'voxel_debug', 'voxel_debug');
    
    // Prepare input for C++ program
    const pointCount = pointCloudData.length / 3;
    const input = `${pointCount} ${voxelSize} ${globalBounds.minX} ${globalBounds.minY} ${globalBounds.minZ} ${globalBounds.maxX} ${globalBounds.maxY} ${globalBounds.maxZ}\n`;
    
    // Add point cloud data - optimized with array join (much faster than string concatenation)
    const pointDataArray = [];
    for (let i = 0; i < pointCloudData.length; i += 3) {
      pointDataArray.push(`${pointCloudData[i]} ${pointCloudData[i + 1]} ${pointCloudData[i + 2]}`);
    }
    
    const fullInput = input + pointDataArray.join('\n') + '\n';
    
    // Debug: Log first few lines of input to C++ executable
    console.log('🔧 Backend: C++ input (first 5 lines):');
    const lines = fullInput.split('\n');
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      console.log(`  Line ${i}: ${lines[i]}`);
    }
    
    // Execute C++ program
    const cppProcess = spawn(cppExecutable);
    
    let voxelCount = 0;
    let originalCount = 0;
    let voxelGridPositions = [];
    
    let outputBuffer = '';
    
    cppProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
      console.log('🔧 Backend: C++ stdout chunk:', data.toString());
    });
    
    cppProcess.stdout.on('end', () => {
      console.log('🔧 Backend: C++ stdout complete:', outputBuffer);
      
      // Split by whitespace to get all numbers
      const allNumbers = outputBuffer.trim().split(/\s+/).map(parseFloat).filter(n => !isNaN(n));
      
      if (allNumbers.length > 0) {
        // First number is the voxel count
        voxelCount = allNumbers[0];
        originalCount = pointCount;
        
        // Rest are the voxel center coordinates
        if (allNumbers.length > 1) {
          voxelGridPositions = allNumbers.slice(1);
        }
      }
      
      console.log('🔧 Backend: Parsed voxelCount:', voxelCount, 'positions:', voxelGridPositions.length);
      
      // Send response after processing stdout
      const processingTime = Date.now() - startTime;
      
      console.log('🔧 Backend: C++ voxel debug processing completed', {
        voxelCount: voxelCount,
        processingTime: processingTime + 'ms'
      });
      
      res.json({
        success: true,
        voxelCenters: voxelGridPositions,
        voxelCount: voxelCount,
        originalCount: originalCount,
        processingTime: processingTime,
        method: 'Backend C++ (real)'
      });
    });
    
    cppProcess.stderr.on('data', (data) => {
      console.error('🔧 Backend: C++ stderr:', data.toString());
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
    cppProcess.stdin.write(fullInput);
    cppProcess.stdin.end();
    
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
    const rustExecutable = path.join(__dirname, 'services', 'tools', 'voxel_downsample', 'voxel_downsample_rust');
    
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
    
    // Use Rust backend processing
    console.log('🔧 Backend: Using Rust backend processing for voxel debug');
    
    // Path to the Rust executable
    const rustExecutable = path.join(__dirname, 'services', 'tools', 'voxel_debug', 'voxel_debug_rust');
    
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
        
        console.log('🔧 Backend: Rust voxel debug completed', {
          voxelCount: result.voxel_count,
          processingTime: result.processing_time,
          totalTime: processingTime
        });
        
        res.json({
          success: true,
          voxelGridPositions: result.voxel_grid_positions,
          voxelCount: result.voxel_count,
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
