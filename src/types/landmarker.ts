// MediaPipe landmarker types and configurations

export type LandmarkerType = 'pose' | 'hand' | 'face' | 'holistic';

export interface LandmarkerConfig {
  name: string;
  type: LandmarkerType;
  displayName: string;
  description: string;
  gameUseCase: string;
  landmarks: number;
  accuracy: number; // 0-100 scale
  speed: number; // fps on reference hardware
  memoryRequirement: number; // MB
  outputFormat: 'pose2d' | 'pose3d' | 'hand' | 'face' | 'holistic';
  parameters: {
    confidenceThreshold: number;
    numHands?: number;
    numFaces?: number;
    modelComplexity?: 0 | 1 | 2;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
  };
  modelPath: string;
  supportsVideo: boolean;
  supportsWebGL: boolean;
}

export const LANDMARKER_CONFIGS: Record<LandmarkerType, LandmarkerConfig> = {
  pose: {
    name: 'mediapipe-pose',
    type: 'pose',
    displayName: 'Pose Landmarker',
    description: 'Full body pose estimation for character animation',
    gameUseCase: 'Character movement, combat animations, dance sequences',
    landmarks: 33,
    accuracy: 90,
    speed: 30,
    memoryRequirement: 40,
    outputFormat: 'pose3d',
    parameters: { 
      confidenceThreshold: 0.5,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    },
    modelPath: '/models/pose_landmarker.task',
    supportsVideo: true,
    supportsWebGL: true
  },
  hand: {
    name: 'mediapipe-hand',
    type: 'hand',
    displayName: 'Hand Landmarker',
    description: 'Precise hand tracking for gesture-based interactions',
    gameUseCase: 'UI gestures, spell casting, object manipulation',
    landmarks: 42, // 21 per hand, up to 2 hands
    accuracy: 95,
    speed: 25,
    memoryRequirement: 35,
    outputFormat: 'hand',
    parameters: { 
      confidenceThreshold: 0.7,
      numHands: 2,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5
    },
    modelPath: '/models/hand_landmarker.task',
    supportsVideo: true,
    supportsWebGL: true
  },
  face: {
    name: 'mediapipe-face',
    type: 'face',
    displayName: 'Face Landmarker',
    description: 'Detailed facial expression capture for character emotions',
    gameUseCase: 'Facial animation, emotion systems, dialogue scenes',
    landmarks: 468,
    accuracy: 92,
    speed: 20,
    memoryRequirement: 60,
    outputFormat: 'face',
    parameters: { 
      confidenceThreshold: 0.6,
      numFaces: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    },
    modelPath: '/models/face_landmarker.task',
    supportsVideo: true,
    supportsWebGL: true
  },
  holistic: {
    name: 'mediapipe-holistic',
    type: 'holistic',
    displayName: 'Holistic Landmarker',
    description: 'Combined pose, hand, and face tracking for complete capture',
    gameUseCase: 'Full character performance, cutscenes, detailed NPCs',
    landmarks: 543, // 33 pose + 42 hands + 468 face
    accuracy: 88,
    speed: 15,
    memoryRequirement: 120,
    outputFormat: 'holistic',
    parameters: {
      confidenceThreshold: 0.5,
      numHands: 2,
      numFaces: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    },
    modelPath: '/models/holistic_landmarker.task',
    supportsVideo: true,
    supportsWebGL: true
  }
};

// Unified landmark point structure
export interface LandmarkPoint {
  x: number; // Normalized [0-1] coordinate
  y: number; // Normalized [0-1] coordinate
  z?: number; // Depth (when available)
  visibility?: number; // Confidence of point visibility
  presence?: number; // Confidence of point presence
}

// Individual landmarker result types
export interface PoseLandmarks {
  landmarks: LandmarkPoint[];
  worldLandmarks?: LandmarkPoint[]; // 3D world coordinates
}

export interface HandLandmarks {
  landmarks: LandmarkPoint[];
  handedness: 'Left' | 'Right';
  worldLandmarks?: LandmarkPoint[];
}

export interface FaceLandmarks {
  landmarks: LandmarkPoint[];
  faceBlendshapes?: Array<{
    categoryName: string;
    score: number;
  }>;
}

// Unified landmarker result
export interface LandmarkerResult {
  type: LandmarkerType;
  timestamp: number;
  frameIndex: number;
  processingTime: number; // ms
  confidence: number;
  
  // Type-specific results
  pose?: PoseLandmarks;
  hands?: HandLandmarks[];
  face?: FaceLandmarks;
  
  // Combined for holistic
  holistic?: {
    pose: PoseLandmarks;
    hands: HandLandmarks[];
    face: FaceLandmarks;
  };
}

// Processing options for each landmarker type
export interface ProcessingOptions {
  landmarkerType: LandmarkerType;
  parameters: LandmarkerConfig['parameters'];
  outputSettings: {
    includeWorldLandmarks: boolean;
    includeBlendshapes: boolean;
    smoothingFactor: number; // 0-1
    confidenceFilter: boolean;
  };
  performanceSettings: {
    useWebGL: boolean;
    maxProcessingTime: number; // ms
    skipFramesOnOverload: boolean;
  };
}

// Performance metrics
export interface LandmarkerPerformance {
  landmarkerType: LandmarkerType;
  averageProcessingTime: number; // ms per frame
  frameRate: number; // fps
  accuracy: number; // 0-1
  memoryUsage: number; // MB
  gpuAccelerated: boolean;
  droppedFrames: number;
  totalFrames: number;
}

// Batch processing result
export interface BatchLandmarkerResult {
  videoId: string;
  landmarkerType: LandmarkerType;
  results: LandmarkerResult[];
  performance: LandmarkerPerformance;
  metadata: {
    videoDuration: number; // seconds
    videoFps: number;
    totalFrames: number;
    processedFrames: number;
    startTime: number;
    endTime: number;
  };
}

// Game engine optimization contexts
export type GameEngine = 'unity' | 'unreal' | 'generic';

export interface GameOptimizationContext {
  engine: GameEngine;
  targetFps: number;
  memoryConstraints: number; // MB
  qualityPreference: 'speed' | 'balanced' | 'quality';
  specificFeatures?: {
    characterRigging?: boolean;
    blendShapes?: boolean;
    ikSolving?: boolean;
    rootMotion?: boolean;
  };
}

// Model comparison data
export interface ModelComparison {
  videoId: string;
  results: Array<{
    landmarkerType: LandmarkerType;
    result: BatchLandmarkerResult;
    score: number; // Overall quality score
  }>;
  recommendation: {
    bestForAccuracy: LandmarkerType;
    bestForSpeed: LandmarkerType;
    bestForGameUse: LandmarkerType;
    reasoning: string;
  };
}