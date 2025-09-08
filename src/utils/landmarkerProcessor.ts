// Unified landmarker processor for pose, hand, face, and holistic processing

import {
  LandmarkerType,
  LandmarkerResult,
  ProcessingOptions,
  PoseLandmarks,
  HandLandmarks,
  FaceLandmarks,
  LandmarkerPerformance,
  BatchLandmarkerResult
} from '../types/landmarker';
import { modelManager } from './modelManager';
import { ErrorHandler, withErrorHandling } from './errorHandler';
import { memoryManager } from './memoryManager';

export interface ProcessingFrame {
  imageData: ImageData;
  timestamp: number;
  frameIndex: number;
}

export class LandmarkerProcessor {
  private static instance: LandmarkerProcessor;
  private performanceMetrics: Map<LandmarkerType, LandmarkerPerformance> = new Map();
  private processingActive = false;

  private constructor() {}

  static getInstance(): LandmarkerProcessor {
    if (!LandmarkerProcessor.instance) {
      LandmarkerProcessor.instance = new LandmarkerProcessor();
    }
    return LandmarkerProcessor.instance;
  }

  async processFrame(
    frame: ProcessingFrame,
    landmarkerType: LandmarkerType,
    options: ProcessingOptions
  ): Promise<LandmarkerResult | null> {
    const startTime = performance.now();
    
    const { result, error } = await withErrorHandling(async () => {
      const landmarker = modelManager.getLandmarker(landmarkerType);
      if (!landmarker) {
        throw new Error(`${landmarkerType} landmarker not loaded`);
      }

      // Convert ImageData to format expected by MediaPipe
      const canvas = this.createCanvasFromImageData(frame.imageData);
      
      let rawResult;
      switch (landmarkerType) {
        case 'pose':
          rawResult = await this.processPoseFrame(landmarker, canvas, frame.timestamp);
          break;
        case 'hand':
          rawResult = await this.processHandFrame(landmarker, canvas, frame.timestamp);
          break;
        case 'face':
          rawResult = await this.processFaceFrame(landmarker, canvas, frame.timestamp);
          break;
        case 'holistic':
          rawResult = await this.processHolisticFrame(landmarker, canvas, frame.timestamp);
          break;
        default:
          throw new Error(`Unsupported landmarker type: ${landmarkerType}`);
      }

      const processingTime = performance.now() - startTime;
      
      // Apply post-processing filters
      const filtered = this.applyFilters(rawResult, options);
      
      // Calculate confidence score
      const confidence = this.calculateConfidence(filtered, landmarkerType);

      return this.formatResult(
        landmarkerType,
        filtered,
        frame,
        processingTime,
        confidence
      );
    }, `Processing ${landmarkerType} frame ${frame.frameIndex}`);

    if (error) {
      console.error(`Frame processing failed:`, error);
      return null;
    }

    // Update performance metrics
    this.updatePerformanceMetrics(landmarkerType, performance.now() - startTime);
    
    return result;
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
    // Process with individual landmarkers and combine results
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

  private processHandResults(handResults: any): HandLandmarks[] {
    const hands: HandLandmarks[] = [];
    
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

  private applyFilters(rawResult: any, options: ProcessingOptions): any {
    let filtered = { ...rawResult };
    
    // Apply confidence filtering
    if (options.outputSettings.confidenceFilter) {
      filtered = this.filterByConfidence(filtered, options.parameters.confidenceThreshold);
    }
    
    // Apply smoothing
    if (options.outputSettings.smoothingFactor > 0) {
      filtered = this.applySmoothing(filtered, options.outputSettings.smoothingFactor);
    }
    
    return filtered;
  }

  private filterByConfidence(result: any, threshold: number): any {
    // Implementation would filter landmarks based on confidence/visibility scores
    // For now, returning as-is but in production would filter low-confidence points
    return result;
  }

  private applySmoothing(result: any, smoothingFactor: number): any {
    // Implementation would apply temporal smoothing across frames
    // This would require maintaining frame history
    return result;
  }

  private calculateConfidence(result: any, landmarkerType: LandmarkerType): number {
    let totalConfidence = 0;
    let pointCount = 0;
    
    switch (landmarkerType) {
      case 'pose':
        if (result.landmarks) {
          result.landmarks.forEach((point: any) => {
            if (point.visibility !== undefined) {
              totalConfidence += point.visibility;
              pointCount++;
            }
          });
        }
        break;
        
      case 'hand':
        result.landmarks?.forEach((hand: any) => {
          if (hand.landmarks) {
            hand.landmarks.forEach((point: any) => {
              totalConfidence += point.presence || 1.0;
              pointCount++;
            });
          }
        });
        break;
        
      case 'face':
        if (result.landmarks) {
          // Face landmarks typically don't have confidence, so use presence
          totalConfidence = result.landmarks.length > 400 ? 0.9 : 0.7;
          pointCount = 1;
        }
        break;
        
      case 'holistic':
        // Average confidence from all components
        const poseConf = this.calculateConfidence(result.pose, 'pose');
        const handConf = result.hands.length > 0 ? 
          result.hands.reduce((sum: number, hand: any) => sum + this.calculateConfidence(hand, 'hand'), 0) / result.hands.length : 0;
        const faceConf = this.calculateConfidence(result.face, 'face');
        
        totalConfidence = (poseConf + handConf + faceConf) / 3;
        pointCount = 1;
        break;
    }
    
    return pointCount > 0 ? totalConfidence / pointCount : 0;
  }

  private formatResult(
    landmarkerType: LandmarkerType,
    processedResult: any,
    frame: ProcessingFrame,
    processingTime: number,
    confidence: number
  ): LandmarkerResult {
    const result: LandmarkerResult = {
      type: landmarkerType,
      timestamp: frame.timestamp,
      frameIndex: frame.frameIndex,
      processingTime,
      confidence
    };

    switch (landmarkerType) {
      case 'pose':
        result.pose = {
          landmarks: processedResult.landmarks,
          worldLandmarks: processedResult.worldLandmarks
        };
        break;
        
      case 'hand':
        result.hands = processedResult.landmarks.map((landmarks: any, index: number) => ({
          landmarks,
          handedness: processedResult.handedness[index]?.categoryName || 'Unknown',
          worldLandmarks: processedResult.worldLandmarks?.[index]
        }));
        break;
        
      case 'face':
        result.face = {
          landmarks: processedResult.landmarks,
          faceBlendshapes: processedResult.faceBlendshapes?.map((bs: any) => ({
            categoryName: bs.categoryName,
            score: bs.score
          }))
        };
        break;
        
      case 'holistic':
        result.holistic = {
          pose: processedResult.pose,
          hands: processedResult.hands,
          face: processedResult.face
        };
        break;
    }

    return result;
  }

  async processBatch(
    frames: ProcessingFrame[],
    landmarkerType: LandmarkerType,
    options: ProcessingOptions,
    onProgress?: (progress: number, currentFrame: number) => void
  ): Promise<BatchLandmarkerResult> {
    const startTime = performance.now();
    const results: LandmarkerResult[] = [];
    let processedFrames = 0;
    
    // Ensure landmarker is loaded
    const loadResult = await modelManager.loadLandmarker(landmarkerType, options);
    if (!loadResult.success) {
      throw new Error(`Failed to load ${landmarkerType} landmarker: ${loadResult.error}`);
    }

    this.processingActive = true;
    
    try {
      for (const frame of frames) {
        // Check memory pressure
        const memoryStats = await memoryManager.getMemoryStats();
        if (memoryStats.status === 'critical') {
          console.warn('Memory pressure detected, pausing processing');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const result = await this.processFrame(frame, landmarkerType, options);
        if (result) {
          results.push(result);
        }
        
        processedFrames++;
        onProgress?.(processedFrames / frames.length, processedFrames);
        
        // Small delay to prevent blocking
        if (processedFrames % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
    } finally {
      this.processingActive = false;
    }

    const endTime = performance.now();
    const processingDuration = (endTime - startTime) / 1000; // seconds
    
    // Calculate performance metrics
    const performance: LandmarkerPerformance = {
      landmarkerType,
      averageProcessingTime: results.reduce((sum, r) => sum + r.processingTime, 0) / results.length,
      frameRate: results.length / processingDuration,
      accuracy: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
      memoryUsage: modelManager.getMemoryUsage(),
      gpuAccelerated: options.performanceSettings.useWebGL,
      droppedFrames: frames.length - results.length,
      totalFrames: frames.length
    };

    return {
      videoId: `batch_${Date.now()}`,
      landmarkerType,
      results,
      performance,
      metadata: {
        videoDuration: frames.length > 0 ? frames[frames.length - 1].timestamp - frames[0].timestamp : 0,
        videoFps: frames.length / processingDuration,
        totalFrames: frames.length,
        processedFrames: results.length,
        startTime,
        endTime
      }
    };
  }

  private updatePerformanceMetrics(landmarkerType: LandmarkerType, processingTime: number): void {
    let metrics = this.performanceMetrics.get(landmarkerType);
    if (!metrics) {
      metrics = {
        landmarkerType,
        averageProcessingTime: processingTime,
        frameRate: 1000 / processingTime,
        accuracy: 0,
        memoryUsage: 0,
        gpuAccelerated: false,
        droppedFrames: 0,
        totalFrames: 1
      };
    } else {
      // Update running average
      metrics.totalFrames++;
      metrics.averageProcessingTime = (
        (metrics.averageProcessingTime * (metrics.totalFrames - 1) + processingTime) / metrics.totalFrames
      );
      metrics.frameRate = 1000 / metrics.averageProcessingTime;
    }
    
    this.performanceMetrics.set(landmarkerType, metrics);
  }

  getPerformanceMetrics(landmarkerType: LandmarkerType): LandmarkerPerformance | null {
    return this.performanceMetrics.get(landmarkerType) || null;
  }

  getAllPerformanceMetrics(): Map<LandmarkerType, LandmarkerPerformance> {
    return new Map(this.performanceMetrics);
  }

  clearPerformanceMetrics(): void {
    this.performanceMetrics.clear();
  }

  isProcessing(): boolean {
    return this.processingActive;
  }

  stopProcessing(): void {
    this.processingActive = false;
  }

  private createCanvasFromImageData(imageData: ImageData): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
}

// Global landmarker processor instance
export const landmarkerProcessor = LandmarkerProcessor.getInstance();

// React hook for landmarker processing
export function useLandmarkerProcessor() {
  return {
    landmarkerProcessor,
    processFrame: landmarkerProcessor.processFrame.bind(landmarkerProcessor),
    processBatch: landmarkerProcessor.processBatch.bind(landmarkerProcessor),
    getPerformanceMetrics: landmarkerProcessor.getPerformanceMetrics.bind(landmarkerProcessor),
    isProcessing: landmarkerProcessor.isProcessing.bind(landmarkerProcessor),
    stopProcessing: landmarkerProcessor.stopProcessing.bind(landmarkerProcessor)
  };
}