import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    
    // Add point cloud data
    let pointData = '';
    for (let i = 0; i < points.length; i += 3) {
      pointData += `${points[i]} ${points[i + 1]} ${points[i + 2]}\n`;
    }
    
    const fullInput = input + pointData;
    
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
    
    // Add point cloud data
    let pointData = '';
    for (let i = 0; i < pointCloudData.length; i += 3) {
      pointData += `${pointCloudData[i]} ${pointCloudData[i + 1]} ${pointCloudData[i + 2]}\n`;
    }
    
    const fullInput = input + pointData;
    
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
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Voxel downsampling: http://localhost:${PORT}/api/voxel-downsample`);
  console.log(`Point smoothing: http://localhost:${PORT}/api/point-smooth`);
  console.log(`Voxel debug: http://localhost:${PORT}/api/voxel-debug`);
});
