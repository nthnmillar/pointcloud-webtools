# LAZ File Loader

This project now includes a comprehensive LAZ file loader system that allows you to load and visualize LAZ (compressed LAS) point cloud files in the browser.

## Features

- **LAZ File Support**: Load and process LAZ files using the `laz-perf` library
- **Progress Tracking**: Real-time loading progress with visual indicators
- **Point Cloud Integration**: Seamlessly integrates with the existing point cloud visualization system
- **Error Handling**: Comprehensive error handling and user feedback
- **Metadata Extraction**: Extract file metadata without fully loading the file

## Architecture

The LAZ loader system consists of three main components:

### 1. LoadLazWorker (`src/services/loader/LoadLazWorker.ts`)
- Handles the heavy lifting of LAZ file processing using the `laz-perf` library
- Processes LAZ data in the main thread (can be moved to Web Worker in the future)
- Extracts point coordinates and metadata from LAZ files

### 2. LoadLaz (`src/services/loader/LoadLaz.ts`)
- High-level interface for loading LAZ files
- Manages file reading and conversion to PointCloudData format
- Provides progress callbacks and error handling
- Supports both File objects and ArrayBuffer input

### 3. LoaderService (`src/services/loader/LoaderService.ts`)
- Service layer that manages different file format loaders
- Currently supports LAZ files, extensible for other formats
- Integrates with the ServiceManager for seamless operation

## Usage

### Basic File Loading

```typescript
// Load a LAZ file from a File input
const file = event.target.files[0];
const pointCloudData = await serviceManager.loadFile(file, (progress) => {
  console.log(`Loading: ${progress.progress}% - ${progress.message}`);
});
```

### Loading from ArrayBuffer

```typescript
// Load from ArrayBuffer (useful for server-side processing)
const arrayBuffer = await fetch('/path/to/file.laz').then(r => r.arrayBuffer());
const pointCloudData = await serviceManager.loadLazFromArrayBuffer(
  arrayBuffer, 
  'file.laz',
  (progress) => {
    console.log(`Loading: ${progress.progress}%`);
  }
);
```

### Getting File Metadata

```typescript
// Get metadata without fully loading the file
const metadata = await serviceManager.getFileMetadata(file);
console.log(`File has ${metadata.pointCount} points`);
console.log(`Bounds: ${metadata.bounds.minX} to ${metadata.bounds.maxX}`);
```

## Supported File Formats

- `.laz` - Compressed LAS files
- `.las` - LAS files (planned for future implementation)

## Dependencies

- `laz-perf` - JavaScript library for LAZ file processing
- Built on top of the existing point cloud visualization system

## Integration

The LAZ loader is fully integrated with the existing ServiceManager and PointCloudViewer components. When a LAZ file is loaded:

1. The file is processed by the LoadLazWorker
2. Point data is converted to the standard PointCloudData format
3. The point cloud is automatically added to the visualization system
4. Users can interact with the loaded point cloud using existing controls

## Error Handling

The system provides comprehensive error handling:

- File format validation
- LAZ processing errors
- Memory management for large files
- User-friendly error messages

## Performance Considerations

- Large LAZ files may take time to process
- Progress indicators help users understand loading status
- Memory usage scales with point count
- Consider implementing Web Workers for very large files

## Future Enhancements

- Web Worker support for background processing
- Support for additional point cloud formats (PLY, XYZ, etc.)
- Streaming loading for very large files
- Point cloud compression and optimization
- Advanced filtering and selection tools
