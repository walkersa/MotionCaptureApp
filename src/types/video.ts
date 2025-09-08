export type CaptureType = 'pose' | 'hand' | 'face' | 'holistic';

export interface CaptureTypeConfig {
  id: CaptureType;
  name: string;
  displayName: string;
  description: string;
  gameUseCase: string;
  icon: string;
  color: string;
  landmarks: number;
  accuracy: number;
  speed: number;
  memoryRequirement: number;
  parameters: {
    confidenceThreshold: number;
    numHands?: number;
    numFaces?: number;
  };
}

export interface VideoUploadState {
  file: File | null;
  captureType: CaptureType | null;
  isProcessing: boolean;
  progress: number;
  currentStep: string;
  error: string | null;
  validation: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } | null;
}

export interface ProcessedVideo {
  id: string;
  originalFile: File;
  captureType: CaptureType;
  metadata: import('@/types').VideoMetadata;
  thumbnail: Blob;
  frames: Blob[];
  processedAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export const CAPTURE_TYPE_CONFIGS: CaptureTypeConfig[] = [
  {
    id: 'pose',
    name: 'pose',
    displayName: 'Full Body Pose',
    description: 'Capture full body movement and posture for character animation',
    gameUseCase: 'Character movement, combat animations, dance sequences',
    icon: '🧍',
    color: '#3b82f6',
    landmarks: 33,
    accuracy: 90,
    speed: 30,
    memoryRequirement: 40,
    parameters: {
      confidenceThreshold: 0.5
    }
  },
  {
    id: 'hand',
    name: 'hand',
    displayName: 'Hand Gestures',
    description: 'Track detailed hand movements and finger positions',
    gameUseCase: 'UI interactions, spell casting, object manipulation',
    icon: '✋',
    color: '#10b981',
    landmarks: 42,
    accuracy: 95,
    speed: 25,
    memoryRequirement: 35,
    parameters: {
      confidenceThreshold: 0.7,
      numHands: 2
    }
  },
  {
    id: 'face',
    name: 'face',
    displayName: 'Facial Expression',
    description: 'Capture detailed facial expressions and emotions',
    gameUseCase: 'Character emotions, dialogue scenes, facial animation',
    icon: '😊',
    color: '#f59e0b',
    landmarks: 468,
    accuracy: 92,
    speed: 20,
    memoryRequirement: 60,
    parameters: {
      confidenceThreshold: 0.6,
      numFaces: 1
    }
  },
  {
    id: 'holistic',
    name: 'holistic',
    displayName: 'Complete Capture',
    description: 'Capture pose, hands, and face simultaneously',
    gameUseCase: 'Full character performance, cutscenes, detailed NPCs',
    icon: '🎭',
    color: '#8b5cf6',
    landmarks: 543,
    accuracy: 88,
    speed: 15,
    memoryRequirement: 120,
    parameters: {
      confidenceThreshold: 0.5,
      numHands: 2,
      numFaces: 1
    }
  }
];