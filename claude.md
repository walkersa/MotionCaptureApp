# Personal Motion Capture System - Development Guide

## Project Overview
A browser-based, offline-capable personal motion capture system for game developers to create custom animations from video footage. The system extracts motion data using selectable AI models and integrates with Blender for immediate use in game development workflows.

**Core Value Proposition**: Transform any 10-second video into professional-quality game animations using state-of-the-art pose estimation models.

## Architecture Overview
```
┌─────────────────────────────────────┐
│     React PWA Frontend              │
├─────────────────────────────────────┤
│  Service Worker │ IndexedDB Cache   │
├─────────────────────────────────────┤
│  FFmpeg.wasm │ ONNX Runtime Web     │
├─────────────────────────────────────┤
│  Three.js 3D │ Animation Export     │
├─────────────────────────────────────┤
│     Blender Plugin (Python)         │
└─────────────────────────────────────┘
```

## Technology Stack

### Frontend Framework
- **React 18+** with TypeScript for UI components
- **Vite** with PWA plugin for build system
- **Workbox** for service worker generation
- **IndexedDB + Dexie.js** for persistent storage

### Media Processing
- **FFmpeg.wasm** for video format conversion and frame extraction
- **ONNX Runtime Web** for AI model inference
- **WebGL/WebGPU** for GPU acceleration when available
- **Canvas API** for video preprocessing and thumbnail generation

### 3D Rendering & Animation
- **Three.js** for 3D preview and visualization
- **gl-matrix** for efficient math operations
- **Custom skeletal animation system** for real-time preview

### File Formats & Export
- **BVH** (Biovision Hierarchy) - primary export format
- **FBX** via WebAssembly SDK integration
- **USD** (Universal Scene Description) for modern pipelines
- **Custom JSON** for lightweight data transfer

## Directory Structure
```
src/
├── components/           # React UI components
│   ├── upload/          # Video upload interface
│   ├── processing/      # Model selection and processing
│   ├── preview/         # 3D animation preview
│   ├── export/          # Export format selection
│   └── project/         # Project management
├── workers/             # Web Workers for background processing
│   ├── video-processor.ts
│   ├── model-inference.ts
│   └── export-generator.ts
├── models/              # AI model configurations
│   ├── mediapipe/
│   ├── smpler/
│   └── mobile-poser/
├── exporters/           # Format-specific export logic
│   ├── bvh-exporter.ts
│   ├── fbx-exporter.ts
│   └── json-exporter.ts
├── utils/               # Utility functions
│   ├── video-utils.ts
│   ├── animation-utils.ts
│   └── file-utils.ts
└── types/               # TypeScript type definitions

blender-addon/           # Separate Blender plugin
├── __init__.py
├── operators/
├── panels/
└── utils/

public/
├── models/              # Pre-trained ONNX models
├── sw.js               # Service worker
└── manifest.json       # PWA manifest
```

## Development Environment Setup

### Prerequisites
```bash
# Node.js 18+ required for latest features
node --version  # Should be 18.0.0 or higher
npm --version   # Should be 8.0.0 or higher

# Install dependencies
npm install

# Install Blender for addon development (optional)
# Download from https://www.blender.org/download/
```

### Development Commands
```bash
# Start development server with PWA simulation
npm run dev

# Build for production with service worker
npm run build

# Preview production build locally
npm run preview

# Run TypeScript type checking
npm run type-check

# Run tests with coverage
npm run test
npm run test:coverage

# Lint and format code
npm run lint
npm run format

# Bundle analyzer for optimization
npm run analyze

# Build Blender addon (requires Python 3.9+)
cd blender-addon && python build_addon.py
```

### Environment Variables
```bash
# .env.development
VITE_APP_VERSION=1.0.0
VITE_MODEL_CACHE_SIZE=500MB
VITE_MAX_VIDEO_SIZE=100MB
VITE_DEBUG_MODE=true

# .env.production
VITE_APP_VERSION=1.0.0
VITE_MODEL_CACHE_SIZE=500MB
VITE_MAX_VIDEO_SIZE=100MB
VITE_DEBUG_MODE=false
```

## Critical Technical Constraints

### Browser Storage Limitations
⚠️ **NEVER use localStorage or sessionStorage in React components** - These APIs are NOT supported in Claude.ai artifacts and will cause failures.

**Always use:**
- `useState/useReducer` for React component state
- `IndexedDB` for persistent data storage
- In-memory variables for temporary data

### Video Processing Constraints
- **Maximum file size**: 100MB (≈10 seconds at 1080p)
- **Supported formats**: MP4, MOV, AVI, WebM, MKV
- **Processing target**: <30 seconds for 10-second video
- **Memory limit**: <2GB peak usage during processing

### AI Model Requirements
- **ONNX format only** - all models must be converted to ONNX
- **WebGL backend preferred** with CPU fallback
- **Model size limit**: <200MB per model for reasonable loading times
- **Input standardization**: 256x256 or 512x512 pixel inputs

## Code Style Guidelines

### TypeScript Best Practices
```typescript
// Use strict type definitions
interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  fileSize: number;
}

// Prefer named exports
export const VideoProcessor = {
  // Implementation
};

// Use proper error handling
async function processVideo(file: File): Promise<VideoMetadata> {
  try {
    const metadata = await extractMetadata(file);
    return metadata;
  } catch (error) {
    console.error('Video processing failed:', error);
    throw new Error(`Failed to process video: ${error.message}`);
  }
}
```

### React Component Patterns
```tsx
// Use functional components with TypeScript
interface VideoUploadProps {
  onVideoSelect: (file: File) => void;
  maxSize: number;
}

export const VideoUpload: React.FC<VideoUploadProps> = ({
  onVideoSelect,
  maxSize
}) => {
  const [dragActive, setDragActive] = useState(false);
  
  // Use proper event handlers
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    // Handle file validation
  }, [onVideoSelect, maxSize]);

  return (
    <div 
      onDrop={handleDrop}
      className="upload-zone"
    >
      {/* Component content */}
    </div>
  );
};
```

### Performance Optimization
```javascript
// Use Web Workers for heavy processing
const worker = new Worker('/workers/video-processor.js');
worker.postMessage({ videoData, modelName });

// Implement proper cleanup
useEffect(() => {
  return () => {
    // Clean up resources
    if (videoElement.current) {
      URL.revokeObjectURL(videoElement.current.src);
    }
  };
}, []);

// Use efficient Three.js patterns
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
```

## Testing Strategy

### Unit Testing
```bash
# Test specific components
npm test -- VideoUpload.test.tsx

# Run tests in watch mode
npm test -- --watch

# Generate coverage report
npm run test:coverage
```

### Integration Testing
```typescript
// Example integration test
describe('Motion Capture Pipeline', () => {
  test('complete workflow: upload -> process -> export', async () => {
    const testVideo = await loadTestAsset('walking_sample.mp4');
    
    // Test upload
    const uploadResult = await uploadVideo(testVideo);
    expect(uploadResult.success).toBe(true);
    
    // Test processing
    const processed = await processWithModel(uploadResult.id, 'mediapipe');
    expect(processed.animationData).toBeDefined();
    
    // Test export
    const exported = await exportToBVH(processed.animationData);
    expect(exported.fileData).toBeDefined();
  });
});
```

### Performance Testing
```typescript
// Benchmark critical operations
const performanceTest = async () => {
  const startTime = performance.now();
  await processVideo(testVideoFile);
  const processingTime = performance.now() - startTime;
  
  expect(processingTime).toBeLessThan(30000); // 30 seconds max
};
```

## Blender Addon Development

### Setup Blender Development Environment
```bash
# Symlink addon to Blender addons directory (Linux/Mac)
ln -s $(pwd)/blender-addon ~/.config/blender/3.6/scripts/addons/personal_mocap

# Windows
mklink /D "%APPDATA%\Blender Foundation\Blender\3.6\scripts\addons\personal_mocap" "C:\path\to\project\blender-addon"

# Restart Blender and enable addon in preferences
```

### Addon Development Commands
```bash
# Build addon ZIP for distribution
python blender-addon/build_addon.py

# Run Blender with debug console
blender --python-console

# Test addon installation
python blender-addon/test_install.py
```

### Blender API Patterns
```python
import bpy
from bpy.types import Panel, Operator

class MOCAP_OT_import(Operator):
    bl_idname = "mocap.import_animation"
    bl_label = "Import Motion Capture"
    
    def execute(self, context):
        # Implementation with proper error handling
        try:
            result = self.import_animation_data()
            self.report({'INFO'}, f"Imported {result.frame_count} frames")
            return {'FINISHED'}
        except Exception as e:
            self.report({'ERROR'}, f"Import failed: {str(e)}")
            return {'CANCELLED'}
```

## Common Issues & Solutions

### Memory Management
**Problem**: Large video files causing browser crashes
**Solution**: 
```typescript
// Process video in chunks
const processVideoInChunks = async (videoFile: File) => {
  const chunkSize = 10 * 1024 * 1024; // 10MB chunks
  for (let offset = 0; offset < videoFile.size; offset += chunkSize) {
    const chunk = videoFile.slice(offset, offset + chunkSize);
    await processChunk(chunk);
    
    // Force garbage collection hint
    if (window.gc) window.gc();
  }
};
```

### Service Worker Caching
**Problem**: Updated models not loading
**Solution**:
```javascript
// Update service worker cache version
const CACHE_VERSION = 'v1.2.0';

// Force cache refresh for models
await caches.delete('models-v1.1.0');
```

### ONNX Model Loading
**Problem**: Models failing to load on some browsers
**Solution**:
```typescript
// Fallback loading strategy
const loadModel = async (modelPath: string) => {
  try {
    return await ort.InferenceSession.create(modelPath, {
      executionProviders: ['webgl', 'cpu']
    });
  } catch (error) {
    console.warn('WebGL failed, falling back to CPU');
    return await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu']
    });
  }
};
```

## Performance Targets

| Component | Target | Critical Path |
|-----------|--------|---------------|
| Video Upload | <5s for 50MB | File validation + IndexedDB storage |
| Model Loading | <10s first time | ONNX model download + initialization |
| Frame Processing | 30+ FPS | MediaPipe inference + smoothing |
| Export Generation | <5s | BVH file creation from animation data |
| 3D Preview | 60 FPS | Three.js rendering + animation updates |

## Git Workflow

### Branch Naming
- `feature/video-upload-improvements`
- `bugfix/model-loading-fallback`
- `hotfix/export-format-validation`

### Commit Messages
```
feat(upload): add drag-and-drop video upload support

- Implement HTML5 drag-and-drop API
- Add visual feedback for drag states
- Validate file types and sizes on drop
- Update upload progress indicator

Fixes #123
```

### Pre-commit Hooks
```bash
# Install pre-commit hooks
npm run prepare

# Runs automatically on commit:
# - TypeScript type checking
# - ESLint with auto-fix
# - Prettier formatting
# - Basic test suite
```

## Deployment Checklist

### Before Release
- [ ] All tests passing (`npm test`)
- [ ] TypeScript compilation clean (`npm run type-check`)
- [ ] Bundle size analysis acceptable (`npm run analyze`)
- [ ] Service worker caching verified
- [ ] Blender addon compatibility tested
- [ ] Performance benchmarks met
- [ ] Cross-browser testing completed

### Build Process
```bash
# Production build
npm run build

# Verify PWA functionality
npm run preview

# Test offline capability
# (Disconnect network and verify app functionality)

# Generate Blender addon package
cd blender-addon && python build_addon.py
```

---

*This document should be kept up-to-date as the project evolves. When making significant architectural changes, update the relevant sections and notify the team.*