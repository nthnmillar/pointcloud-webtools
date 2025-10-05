import express from 'express';
import cors from 'cors';
import multer from 'multer';
import VoxelDownsampler from './services/tools/VoxelDownsampler.js';

const app = express();
const PORT = process.env.PORT || 3003;

// Initialize services
const voxelDownsampler = new VoxelDownsampler();

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
app.post('/api/voxel-downsample', (req, res) => {
  try {
    const { points, voxelSize, globalBounds } = req.body;
    
    // Validate inputs using the service
    voxelDownsampler.validateInputs(points, voxelSize, globalBounds);

    const startTime = Date.now();
    
    // Perform voxel downsampling using the service
    const result = voxelDownsampler.performVoxelDownsampling(points, voxelSize, globalBounds);
    
    const processingTime = Date.now() - startTime;
    
    res.json({
      success: true,
      downsampledPoints: result.downsampledPoints,
      originalCount: result.originalCount,
      downsampledCount: result.downsampledCount,
      voxelCount: result.voxelCount,
      reductionRatio: result.reductionRatio,
      processingTime: processingTime,
      method: 'Backend Node.js'
    });
    
  } catch (error) {
    console.error('Voxel downsampling error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Voxel debug endpoint for C++ backend processing
app.post('/api/voxel-debug', (req, res) => {
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
    const cppExecutable = path.join(__dirname, 'cpp', 'voxel_debug');
    
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
