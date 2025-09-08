// MediaPipe landmarker processing worker for background inference

import {
  PoseLandmarker,
  HandLandmarker,
  FaceLandmarker,
  FilesetResolver
} from '@mediapipe/tasks-vision';
import {
  LandmarkerType,
  LandmarkerResult,
  ProcessingOptions,
  BatchLandmarkerResult,
  LANDMARKER_CONFIGS
} from '../types/landmarker';

interface WorkerMessage {
  id: string;
  type: 'initialize' | 'load-model' | 'process-frame' | 'process-batch' | 'unload-model' | 'get-performance';
  payload: any;
}

interface WorkerResponse {
  id: string;
  type: 'progress' | 'complete' | 'error' | 'performance';
  payload: any;
}

class LandmarkerWorker {
  private filesetResolver: any = null;
  private loadedLandmarkers: Map<LandmarkerType, any> = new Map();
  private isInitialized = false;
  private performanceMetrics: Map<LandmarkerType, any> = new Map();

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing MediaPipe in worker...');
      
      this.filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      
      this.isInitialized = true;
      console.log('MediaPipe initialized in worker');
    } catch (error) {
      console.error('Failed to initialize MediaPipe in worker:', error);
      throw error;
    }
  }

  async loadModel(landmarkerType: LandmarkerType, options: ProcessingOptions): Promise<any> {
    await this.initialize();

    if (this.loadedLandmarkers.has(landmarkerType)) {
      return this.loadedLandmarkers.get(landmarkerType);
    }

    const config = LANDMARKER_CONFIGS[landmarkerType];
    console.log(`Loading ${landmarkerType} landmarker in worker...`);

    const landmarkerOptions = {
      baseOptions: {
        modelAssetPath: config.modelPath,
        delegate: options.performanceSettings.useWebGL ? 'GPU' : 'CPU'
      },
      runningMode: 'VIDEO' as const,
      ...this.getLandmarkerSpecificOptions(landmarkerType, options)
    };

    let landmarker: any;

    try {
      switch (landmarkerType) {
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
          // Create individual landmarkers for holistic processing
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
          throw new Error(`Unsupported landmarker type: ${landmarkerType}`);
      }

      this.loadedLandmarkers.set(landmarkerType, landmarker);
      console.log(`Successfully loaded ${landmarkerType} landmarker in worker`);
      
      return landmarker;
    } catch (error) {
      console.error(`Failed to load ${landmarkerType} landmarker in worker:`, error);
      throw error;
    }
  }

  private getLandmarkerSpecificOptions(landmarkerType: LandmarkerType, options: ProcessingOptions): any {
    const config = LANDMARKER_CONFIGS[landmarkerType];
    const params = options.parameters;
    
    const commonOptions = {
      minDetectionConfidence: params.minDetectionConfidence || params.confidenceThreshold,
      minTrackingConfidence: params.minTrackingConfidence || params.confidenceThreshold
    };

    switch (landmarkerType) {
      case 'pose':
        return {
          ...commonOptions,
          modelComplexity: params.modelComplexity || 1,
          smoothLandmarks: options.outputSettings.smoothingFactor > 0,
          enableSegmentation: false,
          outputPoseWorldLandmarks: options.outputSettings.includeWorldLandmarks
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
          outputFaceBlendshapes: options.outputSettings.includeBlendshapes,
          outputFacialTransformationMatrixes: true,
          numFaces: params.numFaces || 1
        };
        
      case 'holistic':
        return {
          ...commonOptions,
          modelComplexity: params.modelComplexity || 1,
          smoothLandmarks: true,
          outputFaceBlendshapes: options.outputSettings.includeBlendshapes,
          outputPoseWorldLandmarks: options.outputSettings.includeWorldLandmarks
        };
        
      default:
        return commonOptions;
    }
  }

  async processFrame(
    imageData: ImageData,
    landmarkerType: LandmarkerType,
    timestamp: number,
    frameIndex: number
  ): Promise<LandmarkerResult> {
    const startTime = performance.now();
    
    const landmarker = this.loadedLandmarkers.get(landmarkerType);
    if (!landmarker) {
      throw new Error(`${landmarkerType} landmarker not loaded`);
    }

    // Convert ImageData to canvas for MediaPipe processing
    const canvas = this.createCanvasFromImageData(imageData);
    
    let rawResult;
    switch (landmarkerType) {
      case 'pose':
        rawResult = await this.processPoseFrame(landmarker, canvas, timestamp);
        break;
      case 'hand':
        rawResult = await this.processHandFrame(landmarker, canvas, timestamp);
        break;
      case 'face':
        rawResult = await this.processFaceFrame(landmarker, canvas, timestamp);
        break;
      case 'holistic':
        rawResult = await this.processHolisticFrame(landmarker, canvas, timestamp);
        break;
      default:
        throw new Error(`Unsupported landmarker type: ${landmarkerType}`);
    }

    const processingTime = performance.now() - startTime;
    const confidence = this.calculateConfidence(rawResult, landmarkerType);

    // Update performance metrics
    this.updatePerformanceMetrics(landmarkerType, processingTime, confidence);

    return this.formatResult(
      landmarkerType,
      rawResult,
      timestamp,
      frameIndex,
      processingTime,
      confidence
    );
  }

  private async processPoseFrame(landmarker: any, canvas: HTMLCanvasElement, timestamp: number): Promise<any> {
    const results = landmarker.detectForVideo(canvas, timestamp);
    return {
      type: 'pose',
      landmarks: results.landmarks?.[0] || [],
      worldLandmarks: results.worldLandmarks?.[0] || []
    };
  }

  private async processHandFrame(landmarker: any, canvas: HTMLCanvasElement, timestamp: number): Promise<any> {
    const results = landmarker.detectForVideo(canvas, timestamp);
    return {
      type: 'hand',
      landmarks: results.landmarks || [],
      handedness: results.handedness || [],
      worldLandmarks: results.worldLandmarks || []
    };
  }

  private async processFaceFrame(landmarker: any, canvas: HTMLCanvasElement, timestamp: number): Promise<any> {
    const results = landmarker.detectForVideo(canvas, timestamp);
    return {
      type: 'face',
      landmarks: results.faceLandmarks?.[0] || [],
      faceBlendshapes: results.faceBlendshapes?.[0]?.categories || []
    };
  }

  private async processHolisticFrame(landmarker: any, canvas: HTMLCanvasElement, timestamp: number): Promise<any> {
    const poseResults = landmarker.pose.detectForVideo(canvas, timestamp);
    const handResults = landmarker.hands.detectForVideo(canvas, timestamp);
    const faceResults = landmarker.face.detectForVideo(canvas, timestamp);

    return {
      type: 'holistic',
      pose: {
        landmarks: poseResults.landmarks?.[0] || [],
        worldLandmarks: poseResults.worldLandmarks?.[0] || []
      },
      hands: this.processHandResults(handResults),
      face: {
        landmarks: faceResults.faceLandmarks?.[0] || [],
        faceBlendshapes: faceResults.faceBlendshapes?.[0]?.categories || []
      }
    };
  }

  private processHandResults(handResults: any): any[] {
    const hands = [];
    
    if (handResults.landmarks && handResults.handedness) {
      for (let i = 0; i < handResults.landmarks.length; i++) {
        hands.push({
          landmarks: handResults.landmarks[i] || [],
          handedness: handResults.handedness[i]?.categoryName || 'Unknown',
          worldLandmarks: handResults.worldLandmarks?.[i] || []
        });
      }
    }
    
    return hands;
  }

  private calculateConfidence(result: any, landmarkerType: LandmarkerType): number {
    // Simplified confidence calculation
    switch (landmarkerType) {
      case 'pose':
        return result.landmarks.length > 20 ? 0.9 : 0.6;
      case 'hand':
        return result.landmarks.length > 0 ? 0.95 : 0.5;
      case 'face':
        return result.landmarks.length > 400 ? 0.92 : 0.7;
      case 'holistic':
        const poseConf = result.pose.landmarks.length > 20 ? 0.9 : 0.6;
        const handConf = result.hands.length > 0 ? 0.95 : 0.5;
        const faceConf = result.face.landmarks.length > 400 ? 0.92 : 0.7;
        return (poseConf + handConf + faceConf) / 3;
      default:
        return 0.5;
    }
  }

  private formatResult(
    landmarkerType: LandmarkerType,
    rawResult: any,
    timestamp: number,
    frameIndex: number,
    processingTime: number,
    confidence: number
  ): LandmarkerResult {
    const result: LandmarkerResult = {
      type: landmarkerType,
      timestamp,
      frameIndex,
      processingTime,
      confidence
    };

    switch (landmarkerType) {
      case 'pose':
        result.pose = {
          landmarks: rawResult.landmarks,
          worldLandmarks: rawResult.worldLandmarks
        };
        break;
        
      case 'hand':
        result.hands = rawResult.landmarks.map((landmarks: any, index: number) => ({
          landmarks,
          handedness: rawResult.handedness[index]?.categoryName || 'Unknown',
          worldLandmarks: rawResult.worldLandmarks?.[index]
        }));
        break;
        
      case 'face':
        result.face = {
          landmarks: rawResult.landmarks,
          faceBlendshapes: rawResult.faceBlendshapes?.map((bs: any) => ({
            categoryName: bs.categoryName,
            score: bs.score
          }))
        };
        break;
        
      case 'holistic':
        result.holistic = {
          pose: rawResult.pose,
          hands: rawResult.hands,
          face: rawResult.face
        };
        break;
    }

    return result;
  }

  async processBatch(
    frames: Array<{ imageData: ImageData; timestamp: number; frameIndex: number }>,
    landmarkerType: LandmarkerType,
    options: ProcessingOptions
  ): Promise<BatchLandmarkerResult> {
    const startTime = performance.now();
    const results: LandmarkerResult[] = [];
    
    // Ensure landmarker is loaded
    await this.loadModel(landmarkerType, options);
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      
      this.postMessage({
        id: 'batch-progress',
        type: 'progress',
        payload: {
          progress: i / frames.length,
          currentFrame: i,
          totalFrames: frames.length,
          step: `Processing frame ${i + 1}/${frames.length}`
        }
      });

      try {
        const result = await this.processFrame(
          frame.imageData,
          landmarkerType,
          frame.timestamp,
          frame.frameIndex
        );
        results.push(result);
      } catch (error) {
        console.error(`Failed to process frame ${i}:`, error);
        // Continue processing other frames
      }

      // Small delay to prevent blocking
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    const endTime = performance.now();
    const processingDuration = (endTime - startTime) / 1000;

    const batchResult: BatchLandmarkerResult = {
      videoId: `batch_${Date.now()}`,
      landmarkerType,
      results,
      performance: {
        landmarkerType,
        averageProcessingTime: results.reduce((sum, r) => sum + r.processingTime, 0) / results.length,
        frameRate: results.length / processingDuration,
        accuracy: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
        memoryUsage: 0, // Would be calculated based on actual usage
        gpuAccelerated: options.performanceSettings.useWebGL,
        droppedFrames: frames.length - results.length,
        totalFrames: frames.length
      },
      metadata: {
        videoDuration: frames.length > 0 ? frames[frames.length - 1].timestamp - frames[0].timestamp : 0,
        videoFps: frames.length / processingDuration,
        totalFrames: frames.length,
        processedFrames: results.length,
        startTime,
        endTime
      }
    };

    return batchResult;
  }

  private updatePerformanceMetrics(landmarkerType: LandmarkerType, processingTime: number, confidence: number): void {
    let metrics = this.performanceMetrics.get(landmarkerType);
    if (!metrics) {
      metrics = {
        totalFrames: 0,
        totalProcessingTime: 0,
        totalConfidence: 0
      };
    }
    
    metrics.totalFrames++;
    metrics.totalProcessingTime += processingTime;
    metrics.totalConfidence += confidence;
    
    this.performanceMetrics.set(landmarkerType, metrics);
  }

  getPerformanceMetrics(landmarkerType: LandmarkerType): any {
    const metrics = this.performanceMetrics.get(landmarkerType);
    if (!metrics || metrics.totalFrames === 0) return null;
    
    return {
      landmarkerType,
      averageProcessingTime: metrics.totalProcessingTime / metrics.totalFrames,
      frameRate: 1000 / (metrics.totalProcessingTime / metrics.totalFrames),
      accuracy: metrics.totalConfidence / metrics.totalFrames,
      memoryUsage: 0, // Would be calculated
      gpuAccelerated: false, // Would be detected
      droppedFrames: 0,
      totalFrames: metrics.totalFrames
    };
  }

  async unloadModel(landmarkerType: LandmarkerType): Promise<void> {
    const landmarker = this.loadedLandmarkers.get(landmarkerType);
    if (landmarker) {
      try {
        if (landmarker.close) {
          landmarker.close();
        } else if (landmarker.type === 'holistic') {
          if (landmarker.pose?.close) landmarker.pose.close();
          if (landmarker.hands?.close) landmarker.hands.close();
          if (landmarker.face?.close) landmarker.face.close();
        }
        
        this.loadedLandmarkers.delete(landmarkerType);
        console.log(`Unloaded ${landmarkerType} landmarker from worker`);
      } catch (error) {
        console.error(`Error unloading ${landmarkerType} landmarker:`, error);
      }
    }
  }

  private createCanvasFromImageData(imageData: ImageData): HTMLCanvasElement {
    const canvas = new OffscreenCanvas(imageData.width, imageData.height) as any;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);
    return canvas as HTMLCanvasElement;
  }

  private postMessage(response: WorkerResponse) {
    // @ts-ignore - Worker context
    self.postMessage(response);
  }

  async processMessage(message: WorkerMessage): Promise<void> {
    const { id, type, payload } = message;

    try {
      switch (type) {
        case 'initialize':
          await this.initialize();
          this.postMessage({ id, type: 'complete', payload: { initialized: true } });
          break;
          
        case 'load-model':
          await this.loadModel(payload.landmarkerType, payload.options);
          this.postMessage({ id, type: 'complete', payload: { loaded: true } });
          break;
          
        case 'process-frame':
          const frameResult = await this.processFrame(
            payload.imageData,
            payload.landmarkerType,
            payload.timestamp,
            payload.frameIndex
          );
          this.postMessage({ id, type: 'complete', payload: frameResult });
          break;
          
        case 'process-batch':
          const batchResult = await this.processBatch(
            payload.frames,
            payload.landmarkerType,
            payload.options
          );
          this.postMessage({ id, type: 'complete', payload: batchResult });
          break;
          
        case 'get-performance':
          const performance = this.getPerformanceMetrics(payload.landmarkerType);
          this.postMessage({ id, type: 'performance', payload: performance });
          break;
          
        case 'unload-model':
          await this.unloadModel(payload.landmarkerType);
          this.postMessage({ id, type: 'complete', payload: { unloaded: true } });
          break;
          
        default:
          throw new Error(`Unknown message type: ${type}`);
      }
    } catch (error) {
      this.postMessage({
        id,
        type: 'error',
        payload: { error: error instanceof Error ? error.message : 'Processing failed' }
      });
    }
  }
}

// Initialize worker
const worker = new LandmarkerWorker();

// Handle messages from main thread
// @ts-ignore - Worker context
self.onmessage = async (event) => {
  const message: WorkerMessage = event.data;
  await worker.processMessage(message);
};