const express = require('express');
const cors = require('cors');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3001;

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
    
    if (!points || !Array.isArray(points)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid points data. Expected array of numbers.' 
      });
    }
    
    if (typeof voxelSize !== 'number' || voxelSize <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid voxel size. Expected positive number.' 
      });
    }

    const startTime = Date.now();
    
    // Perform voxel downsampling
    const result = performVoxelDownsampling(points, voxelSize, globalBounds);
    
    const processingTime = Date.now() - startTime;
    
    res.json({
      success: true,
      downsampledPoints: result.downsampledPoints,
      originalCount: result.originalCount,
      downsampledCount: result.downsampledCount,
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

// Voxel downsampling implementation
function performVoxelDownsampling(points, voxelSize, globalBounds) {
  // Calculate bounds if not provided
  let bounds = globalBounds;
  if (!bounds) {
    bounds = calculateBounds(points);
  }
  
  // Create a map to store voxel centers
  const voxelMap = new Map();
  
  // Process each point
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i];
    const y = points[i + 1];
    const z = points[i + 2];
    
    // Calculate voxel coordinates
    const voxelX = Math.floor((x - bounds.minX) / voxelSize);
    const voxelY = Math.floor((y - bounds.minY) / voxelSize);
    const voxelZ = Math.floor((z - bounds.minZ) / voxelSize);
    
    // Create voxel key
    const voxelKey = `${voxelX},${voxelY},${voxelZ}`;
    
    // Add point to voxel
    if (voxelMap.has(voxelKey)) {
      const voxel = voxelMap.get(voxelKey);
      voxel.count++;
      voxel.sumX += x;
      voxel.sumY += y;
      voxel.sumZ += z;
    } else {
      voxelMap.set(voxelKey, {
        count: 1,
        sumX: x,
        sumY: y,
        sumZ: z
      });
    }
  }
  
  // Convert voxel centers back to points
  const downsampledPoints = [];
  
  for (const [_, voxel] of voxelMap) {
    // Calculate average position (voxel center)
    const avgX = voxel.sumX / voxel.count;
    const avgY = voxel.sumY / voxel.count;
    const avgZ = voxel.sumZ / voxel.count;
    
    downsampledPoints.push(avgX, avgY, avgZ);
  }
  
  return {
    downsampledPoints,
    originalCount: points.length / 3,
    downsampledCount: downsampledPoints.length / 3
  };
}

// Calculate bounds from point cloud data
function calculateBounds(points) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i];
    const y = points[i + 1];
    const z = points[i + 2];
    
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Voxel downsampling: http://localhost:${PORT}/api/voxel-downsample`);
});
