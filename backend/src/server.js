import express from 'express';
import cors from 'cors';
import multer from 'multer';
const app = express();
const PORT = process.env.PORT || 3003;

// C++ executables are now in services/tools/ directory

// Middleware
app.use(cors());
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
    
    const { spawn } = require('child_process');
    const path = require('path');
    
    // Path to the C++ executable
    const cppExecutable = path.join(__dirname, 'services', 'tools', 'voxel_downsample');
    
    // Prepare input for C++ program
    const pointCount = points.length / 3;
    const input = `${pointCount} ${voxelSize} ${globalBounds.minX} ${globalBounds.minY} ${globalBounds.minZ} ${globalBounds.maxX} ${globalBounds.maxY} ${globalBounds.maxZ}\n`;
    
    // Add point cloud data
    let pointData = '';
    for (let i = 0; i < points.length; i += 3) {
      pointData += `${points[i]} ${points[i + 1]} ${points[i + 2]}\n`;
    }
    
    const fullInput = input + pointData;
    
    // Execute C++ program
    const cppProcess = spawn(cppExecutable);
    
    let voxelCount = 0;
    let originalCount = 0;
    let downsampledCount = 0;
    let downsampledPoints = [];
    
    cppProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.trim().split('\n');
      
      if (lines.length >= 4) {
        voxelCount = parseInt(lines[0]);
        originalCount = parseInt(lines[1]);
        downsampledCount = parseInt(lines[2]);
        const points = lines[3].trim().split(' ').map(parseFloat);
        downsampledPoints = points;
      }
    });
    
    cppProcess.stderr.on('data', (data) => {
      console.error('C++ process error:', data.toString());
    });
    
    // Send input to C++ process
    cppProcess.stdin.write(fullInput);
    cppProcess.stdin.end();
    
    // Wait for C++ process to complete
    await new Promise((resolve, reject) => {
      cppProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`C++ process exited with code ${code}`));
        }
      });
    });
    
    const processingTime = Date.now() - startTime;
    const reductionRatio = originalCount / downsampledCount;
    
    console.log('🔧 Backend: C++ voxel downsampling processing completed', {
      voxelCount: voxelCount,
      processingTime: processingTime + 'ms'
    });
    
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
    
    const { spawn } = require('child_process');
    const path = require('path');
    
    // Path to the C++ executable
    const cppExecutable = path.join(__dirname, 'services', 'tools', 'point_smooth');
    
    // Prepare input for C++ program
    const pointCount = points.length / 3;
    const input = `${pointCount} ${smoothingRadius} ${iterations}\n`;
    
    // Add point cloud data
    let pointData = '';
    for (let i = 0; i < points.length; i += 3) {
      pointData += `${points[i]} ${points[i + 1]} ${points[i + 2]}\n`;
    }
    
    const fullInput = input + pointData;
    
    // Execute C++ program
    const cppProcess = spawn(cppExecutable);
    
    let smoothedPoints = [];
    
    cppProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.trim().split('\n');
      
      if (lines.length >= 2) {
        const pointCount = parseInt(lines[0]);
        const points = lines[1].trim().split(' ').map(parseFloat);
        smoothedPoints = points;
      }
    });
    
    cppProcess.stderr.on('data', (data) => {
      console.error('C++ process error:', data.toString());
    });
    
    // Send input to C++ process
    cppProcess.stdin.write(fullInput);
    cppProcess.stdin.end();
    
    // Wait for C++ process to complete
    await new Promise((resolve, reject) => {
      cppProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`C++ process exited with code ${code}`));
        }
      });
    });
    
    const processingTime = Date.now() - startTime;
    
    console.log('🔧 Backend: C++ point cloud smoothing processing completed', {
      processingTime: processingTime + 'ms'
    });
    
    res.json({
      success: true,
      smoothedPoints: smoothedPoints,
      processingTime: processingTime,
      method: 'Backend C++ (real)'
    });
    
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
    
    const { spawn } = require('child_process');
    const path = require('path');
    
    // Path to the C++ executable
    const cppExecutable = path.join(__dirname, 'services', 'tools', 'voxel_debug');
    
    // Prepare input for C++ program
    const pointCount = pointCloudData.length / 3;
    const input = `${pointCount} ${voxelSize} ${globalBounds.minX} ${globalBounds.minY} ${globalBounds.minZ} ${globalBounds.maxX} ${globalBounds.maxY} ${globalBounds.maxZ}\n`;
    
    // Add point cloud data
    let pointData = '';
    for (let i = 0; i < pointCloudData.length; i += 3) {
      pointData += `${pointCloudData[i]} ${pointCloudData[i + 1]} ${pointCloudData[i + 2]}\n`;
    }
    
    const fullInput = input + pointData;
    
    // Execute C++ program
    const cppProcess = spawn(cppExecutable);
    
    let voxelCount = 0;
    let voxelGridPositions = [];
    
    cppProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.trim().split('\n');
      
      if (lines.length >= 2) {
        voxelCount = parseInt(lines[0]);
        const positions = lines[1].trim().split(' ').map(parseFloat);
        voxelGridPositions = positions;
      }
    });
    
    cppProcess.stderr.on('data', (data) => {
      console.error('C++ process error:', data.toString());
    });
    
    // Send input to C++ process
    cppProcess.stdin.write(fullInput);
    cppProcess.stdin.end();
    
    // Wait for C++ process to complete
    await new Promise((resolve, reject) => {
      cppProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`C++ process exited with code ${code}`));
        }
      });
    });
    
    const processingTime = Date.now() - startTime;
    
    console.log('🔧 Backend: C++ voxel debug processing completed', {
      voxelCount: voxelCount,
      processingTime: processingTime + 'ms'
    });
    
    res.json({
      success: true,
      voxelCenters: voxelGridPositions,
      voxelCount: voxelCount,
      processingTime: processingTime,
      method: 'Backend C++ (real)'
    });
    
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
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Voxel downsampling: http://localhost:${PORT}/api/voxel-downsample`);
  console.log(`Voxel debug: http://localhost:${PORT}/api/voxel-debug`);
});
