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
const voxelDownsamplePool = new ProcessPool(path.join(__dirname, 'services', 'tools', 'voxel_downsample'), 8);
const voxelDebugPool = new ProcessPool(path.join(__dirname, 'services', 'tools', 'voxel_debug'), 4);
const pointSmoothPool = new ProcessPool(path.join(__dirname, 'services', 'tools', 'point_smooth'), 4);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3003;

// WebSocket server for simple single-request processing
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('🔧 WebSocket client connected');
  
  let pendingHeader = null;
  
  ws.on('message', async (data) => {
    try {
      // Check if this is binary data or JSON header
      if (data instanceof Buffer) {
        // This is binary point cloud data
        if (pendingHeader) {
          const { voxelSize, globalBounds, requestId } = pendingHeader;
          
          // Convert binary data to Float32Array
          const points = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
          
          console.log('🔧 WebSocket: Processing voxel downsampling with binary data', {
            pointCount: points.length / 3,
            voxelSize,
            requestId
          });
          
          const startTime = Date.now();
          
          // Get process from pool
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
          
          pendingHeader = null; // Reset for next request
        }
      } else {
        // This is a JSON header
        const message = JSON.parse(data.toString());
        
        if (message.type === 'voxel_downsample') {
          // Store header and wait for binary data
          pendingHeader = message;
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
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
    const cppExecutable = path.join(__dirname, 'services', 'tools', 'voxel_downsample');
    
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
    const cppExecutable = path.join(__dirname, 'services', 'tools', 'point_smooth');
    
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
    const cppExecutable = path.join(__dirname, 'services', 'tools', 'voxel_debug');
    
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
