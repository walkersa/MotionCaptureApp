// Core application types
export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  fileSize: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  sessions: Session[];
}

export interface Session {
  id: string;
  name: string;
  videoFile: Blob;
  thumbnail: Blob;
  metadata: VideoMetadata;
  results?: AnimationData;
  status: 'pending' | 'processing' | 'completed' | 'error';
  createdAt: Date;
}

export interface AnimationData {
  keyframes: Keyframe[];
  duration: number;
  fps: number;
  modelUsed: string;
  confidence: number;
}

export interface Keyframe {
  timestamp: number;
  poses: PoseData[];
}

export interface PoseData {
  landmarks: Landmark[];
  confidence: number;
}

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface ModelConfig {
  name: string;
  displayName: string;
  description: string;
  accuracy: number;
  speed: number;
  memoryRequirement: number;
  format: 'onnx' | 'mediapipe';
}

export interface ExportFormat {
  name: string;
  extension: string;
  description: string;
  supportsAnimation: boolean;
}

export interface AppState {
  currentProject: Project | null;
  isOffline: boolean;
  processingStatus: ProcessingStatus;
  userPreferences: UserPreferences;
}

export interface ProcessingStatus {
  isProcessing: boolean;
  progress: number;
  currentStep: string;
  sessionId?: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  defaultModel: string;
  exportFormat: string;
  autoSave: boolean;
}

// File System Access API types
export interface FileSystemHandle {
  name: string;
  kind: 'file' | 'directory';
}

export interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

export interface FileSystemWritableFileStream extends WritableStream {
  write(data: any): Promise<void>;
  close(): Promise<void>;
}