import express from 'express';
import cors from 'cors';
import multer from 'multer';
import VoxelDownsampler from './services/tools/VoxelDownsampler.js';

const app = express();
const PORT = process.env.PORT || 3001;

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
});
