// MediaPipe model manager for loading and caching landmarkers

import { 
  PoseLandmarker, 
  HandLandmarker, 
  FaceLandmarker,
  FilesetResolver,
  DrawingUtils
} from '@mediapipe/tasks-vision';
import { 
  LandmarkerType, 
  LandmarkerConfig, 
  LANDMARKER_CONFIGS,
  ProcessingOptions 
} from '../types/landmarker';
import { memoryManager } from './memoryManager';
import { ErrorHandler } from './errorHandler';

export interface ModelLoadResult {
  success: boolean;
  landmarker?: PoseLandmarker | HandLandmarker | FaceLandmarker;
  error?: string;
  loadTime: number;
  memoryUsage: number;
}

export class ModelManager {
  private static instance: ModelManager;
  private filesetResolver: any = null;
  private loadedLandmarkers: Map<LandmarkerType, any> = new Map();
  private modelCache: Map<string, ArrayBuffer> = new Map();
  private loadingPromises: Map<LandmarkerType, Promise<ModelLoadResult>> = new Map();
  private isInitialized = false;

  private constructor() {}

  static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing MediaPipe FilesetResolver...');
      
      // Initialize MediaPipe with CDN or local files
      this.filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      
      this.isInitialized = true;
      console.log('MediaPipe FilesetResolver initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MediaPipe FilesetResolver:', error);
      throw new Error(`MediaPipe initialization failed: ${error}`);
    }
  }

  async loadLandmarker(
    type: LandmarkerType, 
    options?: Partial<ProcessingOptions>
  ): Promise<ModelLoadResult> {
    const startTime = performance.now();
    
    try {
      // Check if already loaded
      if (this.loadedLandmarkers.has(type)) {
        return {
          success: true,
          landmarker: this.loadedLandmarkers.get(type),
          loadTime: performance.now() - startTime,
          memoryUsage: 0
        };
      }

      // Check if already loading
      if (this.loadingPromises.has(type)) {
        return await this.loadingPromises.get(type)!;
      }

      // Start loading
      const loadPromise = this.performLandmarkerLoad(type, options, startTime);
      this.loadingPromises.set(type, loadPromise);
      
      const result = await loadPromise;
      this.loadingPromises.delete(type);
      
      return result;
    } catch (error) {
      this.loadingPromises.delete(type);
      const processedError = ErrorHandler.handleVideoError(error);
      
      return {
        success: false,
        error: processedError.message,
        loadTime: performance.now() - startTime,
        memoryUsage: 0
      };
    }
  }

  private async performLandmarkerLoad(
    type: LandmarkerType,
    options: Partial<ProcessingOptions> = {},
    startTime: number
  ): Promise<ModelLoadResult> {
    await this.initialize();
    
    const config = LANDMARKER_CONFIGS[type];
    const memoryBefore = await memoryManager.getMemoryUsage();
    
    // Check memory availability
    const canProcess = await memoryManager.canProcessFile(
      config.memoryRequirement * 1024 * 1024
    );
    
    if (!canProcess.canProcess) {
      throw new Error(`Insufficient memory to load ${type} landmarker: ${canProcess.reason}`);
    }

    console.log(`Loading ${type} landmarker...`);
    
    let landmarker: any;
    const landmarkerOptions = {
      baseOptions: {
        modelAssetPath: config.modelPath,
        delegate: options.performanceSettings?.useWebGL ? 'GPU' : 'CPU'
      },
      runningMode: 'VIDEO' as const,
      ...this.getLandmarkerSpecificOptions(type, options)
    };

    try {
      switch (type) {
        case 'pose':
          landmarker = await PoseLandmarker.createFromOptions(
            this.filesetResolver, 
            landmarkerOptions
          );
          break;
          
        case 'hand':
          landmarker = await HandLandmarker.createFromOptions(
            this.filesetResolver, 
            landmarkerOptions
          );
          break;
          
        case 'face':
          landmarker = await FaceLandmarker.createFromOptions(
            this.filesetResolver, 
            landmarkerOptions
          );
          break;
          
        case 'holistic':
          // For holistic, we'll create individual landmarkers and coordinate them
          const pose = await PoseLandmarker.createFromOptions(
            this.filesetResolver, 
            landmarkerOptions
          );
          const hands = await HandLandmarker.createFromOptions(
            this.filesetResolver, 
            landmarkerOptions
          );
          const face = await FaceLandmarker.createFromOptions(
            this.filesetResolver, 
            landmarkerOptions
          );
          
          landmarker = { pose, hands, face, type: 'holistic' };
          break;
          
        default:
          throw new Error(`Unsupported landmarker type: ${type}`);
      }

      this.loadedLandmarkers.set(type, landmarker);
      
      const memoryAfter = await memoryManager.getMemoryUsage();
      const memoryUsage = memoryAfter.used - memoryBefore.used;
      
      console.log(`Successfully loaded ${type} landmarker in ${performance.now() - startTime}ms`);
      
      return {
        success: true,
        landmarker,
        loadTime: performance.now() - startTime,
        memoryUsage
      };
      
    } catch (error) {
      console.error(`Failed to load ${type} landmarker:`, error);
      throw new Error(`Failed to load ${type} landmarker: ${error}`);
    }
  }

  private getLandmarkerSpecificOptions(
    type: LandmarkerType, 
    options: Partial<ProcessingOptions>
  ): any {
    const config = LANDMARKER_CONFIGS[type];
    const params = options.parameters || config.parameters;
    
    const commonOptions = {
      minDetectionConfidence: params.minDetectionConfidence || params.confidenceThreshold,
      minTrackingConfidence: params.minTrackingConfidence || params.confidenceThreshold
    };

    switch (type) {
      case 'pose':
        return {
          ...commonOptions,
          modelComplexity: params.modelComplexity || 1,
          smoothLandmarks: options.outputSettings?.smoothingFactor ? true : false,
          enableSegmentation: false,
          smoothSegmentation: false,
          outputFaceBlendshapes: false,
          outputPoseWorldLandmarks: options.outputSettings?.includeWorldLandmarks || true
        };
        
      case 'hand':
        return {
          ...commonOptions,
          numHands: params.numHands || 2,
          minHandDetectionConfidence: params.confidenceThreshold,
          minHandPresenceConfidence: params.minTrackingConfidence || 0.5
        };
        
      case 'face':
        return {
          ...commonOptions,
          outputFaceBlendshapes: options.outputSettings?.includeBlendshapes || true,
          outputFacialTransformationMatrixes: true,
          numFaces: params.numFaces || 1
        };
        
      case 'holistic':
        return {
          ...commonOptions,
          modelComplexity: params.modelComplexity || 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          refineHandLandmarks: true,
          outputFaceBlendshapes: options.outputSettings?.includeBlendshapes || true,
          outputPoseWorldLandmarks: options.outputSettings?.includeWorldLandmarks || true
        };
        
      default:
        return commonOptions;
    }
  }

  async unloadLandmarker(type: LandmarkerType): Promise<void> {
    const landmarker = this.loadedLandmarkers.get(type);
    if (landmarker) {
      try {
        if (landmarker.close) {
          landmarker.close();
        } else if (landmarker.type === 'holistic') {
          // Close individual components for holistic
          if (landmarker.pose?.close) landmarker.pose.close();
          if (landmarker.hands?.close) landmarker.hands.close();
          if (landmarker.face?.close) landmarker.face.close();
        }
        
        this.loadedLandmarkers.delete(type);
        console.log(`Unloaded ${type} landmarker`);
        
        // Request garbage collection
        if (window.gc) window.gc();
      } catch (error) {
        console.error(`Error unloading ${type} landmarker:`, error);
      }
    }
  }

  async switchLandmarker(
    fromType: LandmarkerType, 
    toType: LandmarkerType,
    options?: Partial<ProcessingOptions>
  ): Promise<ModelLoadResult> {
    console.log(`Switching landmarker from ${fromType} to ${toType}`);
    
    // Load new landmarker first
    const loadResult = await this.loadLandmarker(toType, options);
    
    if (loadResult.success) {
      // Unload previous landmarker to free memory
      await this.unloadLandmarker(fromType);
    }
    
    return loadResult;
  }

  getLandmarker(type: LandmarkerType): any | null {
    return this.loadedLandmarkers.get(type) || null;
  }

  isLandmarkerLoaded(type: LandmarkerType): boolean {
    return this.loadedLandmarkers.has(type);
  }

  getLoadedLandmarkers(): LandmarkerType[] {
    return Array.from(this.loadedLandmarkers.keys());
  }

  async preloadLandmarker(type: LandmarkerType): Promise<void> {
    try {
      await this.loadLandmarker(type);
    } catch (error) {
      console.warn(`Failed to preload ${type} landmarker:`, error);
    }
  }

  async preloadAllLandmarkers(): Promise<void> {
    const types: LandmarkerType[] = ['pose', 'hand', 'face', 'holistic'];
    const preloadPromises = types.map(type => this.preloadLandmarker(type));
    
    try {
      await Promise.allSettled(preloadPromises);
      console.log('All landmarkers preloaded');
    } catch (error) {
      console.warn('Some landmarkers failed to preload:', error);
    }
  }

  async clearAllLandmarkers(): Promise<void> {
    const types = Array.from(this.loadedLandmarkers.keys());
    for (const type of types) {
      await this.unloadLandmarker(type);
    }
    
    // Clear caches
    this.modelCache.clear();
    this.loadingPromises.clear();
    
    console.log('All landmarkers cleared');
  }

  getMemoryUsage(): number {
    let totalMemory = 0;
    for (const [type, landmarker] of this.loadedLandmarkers) {
      const config = LANDMARKER_CONFIGS[type];
      totalMemory += config.memoryRequirement;
    }
    return totalMemory;
  }

  async getSystemCapabilities(): Promise<{
    webglSupported: boolean;
    estimatedMaxConcurrentLandmarkers: number;
    recommendedLandmarkerType: LandmarkerType;
    memoryStatus: any;
  }> {
    const memoryStats = await memoryManager.getMemoryStats();
    const webglSupported = this.checkWebGLSupport();
    
    // Estimate concurrent landmarkers based on available memory
    const availableMemoryMB = memoryStats.usage.available / (1024 * 1024);
    const maxConcurrent = Math.floor(availableMemoryMB / 120); // Conservative estimate
    
    // Recommend landmarker based on system capabilities
    let recommendedType: LandmarkerType = 'pose';
    if (availableMemoryMB > 500 && webglSupported) {
      recommendedType = 'holistic';
    } else if (availableMemoryMB > 200) {
      recommendedType = 'face';
    } else if (availableMemoryMB > 100) {
      recommendedType = 'hand';
    }
    
    return {
      webglSupported,
      estimatedMaxConcurrentLandmarkers: Math.max(1, maxConcurrent),
      recommendedLandmarkerType: recommendedType,
      memoryStatus: memoryStats
    };
  }

  private checkWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return !!gl;
    } catch (error) {
      return false;
    }
  }
}

// Global model manager instance
export const modelManager = ModelManager.getInstance();

// React hook for model management
export function useModelManager() {
  return {
    modelManager,
    loadLandmarker: modelManager.loadLandmarker.bind(modelManager),
    switchLandmarker: modelManager.switchLandmarker.bind(modelManager),
    unloadLandmarker: modelManager.unloadLandmarker.bind(modelManager),
    isLandmarkerLoaded: modelManager.isLandmarkerLoaded.bind(modelManager),
    getSystemCapabilities: modelManager.getSystemCapabilities.bind(modelManager)
  };
}