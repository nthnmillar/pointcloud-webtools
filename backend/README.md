# Point Cloud Backend Server

This is a Node.js backend server for point cloud processing operations, specifically voxel downsampling.

## Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```
   
   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

The server will start on port 3001 by default.

## API Endpoints

### Health Check
- **GET** `/api/health`
- Returns server status and timestamp

### Voxel Downsampling
- **POST** `/api/voxel-downsample`
- **Body**: 
  ```json
  {
    "points": [x1, y1, z1, x2, y2, z2, ...],
    "voxelSize": 0.1,
    "globalBounds": {
      "minX": -10,
      "minY": -10,
      "minZ": -10,
      "maxX": 10,
      "maxY": 10,
      "maxZ": 10
    }
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "downsampledPoints": [x1, y1, z1, x2, y2, z2, ...],
    "originalCount": 1000,
    "downsampledCount": 500,
    "processingTime": 150,
    "method": "Backend Node.js"
  }
  ```

## Performance Comparison

This backend server is designed to benchmark against:
- **WASM**: Browser-based WebAssembly implementation
- **Backend**: This Node.js server implementation

The backend processes the same voxel downsampling algorithm but runs on the server, allowing for comparison of:
- Processing speed
- Memory usage
- Network overhead
- Scalability

## Configuration

- **Port**: Set via `PORT` environment variable (default: 3001)
- **CORS**: Enabled for frontend communication
- **File size limit**: 100MB for point cloud data

