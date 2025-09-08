// Integrated AI video processing component

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  LandmarkerType,
  ProcessingOptions,
  BatchLandmarkerResult,
  LANDMARKER_CONFIGS
} from '../../types/landmarker';
import { ProcessedVideo, CaptureType } from '../../types/video';
import { useModelManager } from '../../utils/modelManager';
import { useLandmarkerProcessor } from '../../utils/landmarkerProcessor';
import { videoProcessor } from '../../utils/videoProcessor';
import { ProcessingPipelineFactory } from '../../utils/processingPipelines';
import { ModelSelector } from './ModelSelector';
import { LandmarkerVisualization } from './LandmarkerVisualization';
import { PerformanceMetrics } from './PerformanceMetrics';

interface AIVideoProcessorProps {
  video: ProcessedVideo;
  onProcessingComplete?: (results: AIProcessingResult) => void;
  onProgress?: (progress: AIProcessingProgress) => void;
  onError?: (error: string) => void;
  showVisualization?: boolean;
  showMetrics?: boolean;
}

interface AIProcessingResult {
  videoId: string;
  landmarkerResults: BatchLandmarkerResult;
  animationData: any;
  processingTime: number;
  qualityScore: number;
  exportData: {
    bvh?: string;
    json?: string;
    fbx?: ArrayBuffer;
  };
}

interface AIProcessingProgress {
  phase: 'loading' | 'extracting' | 'processing' | 'exporting' | 'complete';
  progress: number;
  currentStep: string;
  estimatedTimeRemaining?: number;
}

export const AIVideoProcessor: React.FC<AIVideoProcessorProps> = ({
  video,
  onProcessingComplete,
  onProgress,
  onError,
  showVisualization = true,
  showMetrics = true
}) => {
  const { modelManager, loadLandmarker } = useModelManager();
  const { processBatch } = useLandmarkerProcessor();
  
  const [selectedLandmarker, setSelectedLandmarker] = useState<LandmarkerType | null>(null);
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions | null>(null);
  const [currentProgress, setCurrentProgress] = useState<AIProcessingProgress>({
    phase: 'loading',
    progress: 0,
    currentStep: 'Select AI model to begin processing'
  });
  const [processingResult, setProcessingResult] = useState<AIProcessingResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  
  const workerRef = useRef<Worker | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    initializeVideoElement();
    initializeWorker();
    
    return () => {
      cleanupResources();
    };
  }, [video]);

  useEffect(() => {
    // Auto-suggest landmarker based on capture type
    if (video.captureType) {
      const suggestedLandmarker = mapCaptureTypeToLandmarker(video.captureType);
      if (suggestedLandmarker && !selectedLandmarker) {
        setSelectedLandmarker(suggestedLandmarker);
        setProcessingOptions(getDefaultProcessingOptions(suggestedLandmarker));
      }
    }
  }, [video.captureType, selectedLandmarker]);

  const initializeVideoElement = useCallback(() => {
    if (videoRef.current && video.originalFile) {
      const videoEl = videoRef.current;
      videoEl.src = URL.createObjectURL(video.originalFile);
      setVideoElement(videoEl);
      
      videoEl.addEventListener('loadedmetadata', () => {
        console.log('Video loaded:', {
          duration: videoEl.duration,
          width: videoEl.videoWidth,
          height: videoEl.videoHeight
        });
      });
    }
  }, [video.originalFile]);

  const initializeWorker = useCallback(() => {
    try {
      workerRef.current = new Worker('/src/workers/landmarkerWorker.ts', { type: 'module' });
      
      workerRef.current.onmessage = (event) => {
        const { type, payload } = event.data;
        
        switch (type) {
          case 'progress':
            setCurrentProgress(prev => ({
              ...prev,
              progress: payload.progress,
              currentStep: payload.step || prev.currentStep
            }));
            onProgress?.(currentProgress);
            break;
            
          case 'complete':
            if (payload.landmarkerType) {
              handleLandmarkerComplete(payload);
            }
            break;
            
          case 'error':
            console.error('AI processing error:', payload.error);
            onError?.(payload.error);
            setIsProcessing(false);
            break;
        }
      };
    } catch (error) {
      console.error('Failed to initialize AI processing worker:', error);
      onError?.('Failed to initialize AI processing');
    }
  }, [onProgress, onError, currentProgress]);

  const mapCaptureTypeToLandmarker = (captureType: CaptureType): LandmarkerType => {
    const mapping: Record<CaptureType, LandmarkerType> = {
      pose: 'pose',
      hand: 'hand', 
      face: 'face',
      holistic: 'holistic'
    };
    return mapping[captureType];
  };

  const getDefaultProcessingOptions = (landmarkerType: LandmarkerType): ProcessingOptions => {
    const config = LANDMARKER_CONFIGS[landmarkerType];
    return {
      landmarkerType,
      parameters: config.parameters,
      outputSettings: {
        includeWorldLandmarks: true,
        includeBlendshapes: landmarkerType === 'face' || landmarkerType === 'holistic',
        smoothingFactor: 0.5,
        confidenceFilter: true
      },
      performanceSettings: {
        useWebGL: true,
        maxProcessingTime: 100,
        skipFramesOnOverload: false
      }
    };
  };

  const handleModelSelect = useCallback((landmarkerType: LandmarkerType, options: ProcessingOptions) => {
    setSelectedLandmarker(landmarkerType);
    setProcessingOptions(options);
    
    setCurrentProgress({
      phase: 'loading',
      progress: 0,
      currentStep: `${LANDMARKER_CONFIGS[landmarkerType].displayName} model ready`
    });
  }, []);

  const startAIProcessing = useCallback(async () => {
    if (!selectedLandmarker || !processingOptions || !videoElement || isProcessing) {
      return;
    }

    setIsProcessing(true);
    const startTime = performance.now();

    try {
      // Phase 1: Load model
      setCurrentProgress({
        phase: 'loading',
        progress: 0.1,
        currentStep: 'Loading AI model...'
      });

      const loadResult = await loadLandmarker(selectedLandmarker, processingOptions);
      if (!loadResult.success) {
        throw new Error(`Failed to load ${selectedLandmarker} model: ${loadResult.error}`);
      }

      // Phase 2: Extract frames
      setCurrentProgress({
        phase: 'extracting',
        progress: 0.2,
        currentStep: 'Extracting video frames...'
      });

      const frames = await extractVideoFrames(videoElement);

      // Phase 3: Process with AI model
      setCurrentProgress({
        phase: 'processing',
        progress: 0.3,
        currentStep: `Processing ${frames.length} frames with ${LANDMARKER_CONFIGS[selectedLandmarker].displayName}...`
      });

      const batchResult = await processBatch(
        frames,
        selectedLandmarker,
        processingOptions,
        (progress, currentFrame) => {
          setCurrentProgress(prev => ({
            ...prev,
            progress: 0.3 + (progress * 0.5), // 30-80% for processing
            currentStep: `Processing frame ${currentFrame}/${frames.length}`,
            estimatedTimeRemaining: calculateETA(progress, performance.now() - startTime)
          }));
        }
      );

      // Phase 4: Generate animation data
      setCurrentProgress({
        phase: 'processing',
        progress: 0.8,
        currentStep: 'Generating animation data...'
      });

      const pipeline = ProcessingPipelineFactory.createPipeline(selectedLandmarker);
      const animationData = await pipeline.process(batchResult.results, {
        engine: 'generic',
        targetFps: 30,
        memoryConstraints: 1024,
        qualityPreference: 'balanced'
      });

      // Phase 5: Export data
      setCurrentProgress({
        phase: 'exporting',
        progress: 0.9,
        currentStep: 'Exporting animation data...'
      });

      const exportData = await generateExportData(animationData, selectedLandmarker);

      const totalTime = performance.now() - startTime;
      
      const finalResult: AIProcessingResult = {
        videoId: video.id,
        landmarkerResults: batchResult,
        animationData,
        processingTime: totalTime,
        qualityScore: calculateQualityScore(batchResult),
        exportData
      };

      setProcessingResult(finalResult);
      setCurrentProgress({
        phase: 'complete',
        progress: 1.0,
        currentStep: `Processing complete! ${Math.round(totalTime / 1000)}s total time`
      });

      onProcessingComplete?.(finalResult);

    } catch (error) {
      console.error('AI processing failed:', error);
      onError?.(error instanceof Error ? error.message : 'AI processing failed');
      setCurrentProgress({
        phase: 'loading',
        progress: 0,
        currentStep: 'Processing failed. Please try again.'
      });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedLandmarker, processingOptions, videoElement, isProcessing, video.id, loadLandmarker, processBatch, onProcessingComplete, onError]);

  const extractVideoFrames = async (videoEl: HTMLVideoElement): Promise<Array<{imageData: ImageData; timestamp: number; frameIndex: number}>> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      const frames: Array<{imageData: ImageData; timestamp: number; frameIndex: number}> = [];
      const fps = 30; // Extract at 30fps
      const duration = videoEl.duration;
      const frameCount = Math.min(300, Math.floor(duration * fps)); // Max 300 frames (10s)
      
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      
      let currentFrame = 0;
      
      const extractFrame = () => {
        if (currentFrame >= frameCount) {
          resolve(frames);
          return;
        }
        
        const timestamp = (currentFrame / fps) * 1000;
        videoEl.currentTime = currentFrame / fps;
        
        videoEl.onseeked = () => {
          ctx.drawImage(videoEl, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          frames.push({
            imageData,
            timestamp,
            frameIndex: currentFrame
          });
          
          currentFrame++;
          
          // Update progress
          const progress = currentFrame / frameCount;
          setCurrentProgress(prev => ({
            ...prev,
            progress: 0.2 + (progress * 0.1), // 20-30% for frame extraction
            currentStep: `Extracting frame ${currentFrame}/${frameCount}`
          }));
          
          setTimeout(extractFrame, 1);
        };
      };
      
      videoEl.onerror = () => reject(new Error('Failed to extract frames'));
      extractFrame();
    });
  };

  const generateExportData = async (animationData: any, landmarkerType: LandmarkerType): Promise<AIProcessingResult['exportData']> => {
    const exportData: AIProcessingResult['exportData'] = {};
    
    try {
      // Generate JSON export (always available)
      exportData.json = JSON.stringify({
        landmarkerType,
        metadata: animationData.metadata,
        keyframes: animationData.keyframes,
        optimizations: animationData.optimizations,
        exportTimestamp: new Date().toISOString()
      }, null, 2);
      
      // Generate BVH export for pose data
      if (landmarkerType === 'pose' || landmarkerType === 'holistic') {
        exportData.bvh = generateBVH(animationData);
      }
      
      // Note: FBX export would require additional libraries
      // exportData.fbx = await generateFBX(animationData);
      
    } catch (error) {
      console.error('Export generation failed:', error);
    }
    
    return exportData;
  };

  const generateBVH = (animationData: any): string => {
    // Simplified BVH generation
    const header = `HIERARCHY
ROOT Hips
{
  OFFSET 0.0 0.0 0.0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Spine
  {
    OFFSET 0.0 5.0 0.0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 0.0 5.0 0.0
    }
  }
}
MOTION
Frames: ${animationData.keyframes.length}
Frame Time: ${1.0 / animationData.metadata.frameRate}
`;

    const frameData = animationData.keyframes.map((keyframe: any) => {
      // Convert keyframe data to BVH format
      return '0.0 0.0 0.0 0.0 0.0 0.0 0.0 0.0 0.0'; // Simplified
    }).join('\n');

    return header + frameData;
  };

  const calculateQualityScore = (batchResult: BatchLandmarkerResult): number => {
    const accuracy = batchResult.performance.accuracy * 100;
    const completeness = (1 - batchResult.performance.droppedFrames / batchResult.performance.totalFrames) * 100;
    const performance = Math.min(100, batchResult.performance.frameRate * 2);
    
    return (accuracy * 0.5 + completeness * 0.3 + performance * 0.2);
  };

  const calculateETA = (progress: number, elapsedTime: number): number => {
    if (progress <= 0) return 0;
    const remainingProgress = 1 - progress;
    const rate = progress / elapsedTime;
    return remainingProgress / rate;
  };

  const cleanupResources = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    
    if (videoElement?.src) {
      URL.revokeObjectURL(videoElement.src);
    }
  }, [videoElement]);

  const downloadExport = (format: 'json' | 'bvh') => {
    if (!processingResult?.exportData) return;
    
    const data = processingResult.exportData[format];
    if (!data) return;
    
    const blob = new Blob([data], { 
      type: format === 'json' ? 'application/json' : 'application/octet-stream' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${video.originalFile.name}_${selectedLandmarker}_animation.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ai-video-processor">
      <div className="processor-header">
        <h3>AI Motion Capture Processing</h3>
        <p className="video-info">
          <strong>{video.originalFile.name}</strong> - {video.captureType} capture
        </p>
      </div>

      {/* Hidden video element for processing */}
      <video 
        ref={videoRef} 
        style={{ display: 'none' }}
        preload="metadata"
      />

      {/* Model Selection */}
      {!processingResult && (
        <div className="model-selection-section">
          <ModelSelector
            selectedModel={selectedLandmarker}
            onModelSelect={handleModelSelect}
            onModelLoad={(model, loading) => {
              if (!loading && model === selectedLandmarker) {
                setCurrentProgress(prev => ({
                  ...prev,
                  currentStep: `${LANDMARKER_CONFIGS[model].displayName} model loaded and ready`
                }));
              }
            }}
            disabled={isProcessing}
            showPerformance={true}
          />
        </div>
      )}

      {/* Processing Status */}
      <div className="processing-status">
        <div className="status-header">
          <h4>Processing Status</h4>
          <span className={`phase-indicator ${currentProgress.phase}`}>
            {currentProgress.phase.charAt(0).toUpperCase() + currentProgress.phase.slice(1)}
          </span>
        </div>

        <div className="progress-container">
          <div className="progress-info">
            <span className="current-step">{currentProgress.currentStep}</span>
            {currentProgress.estimatedTimeRemaining && (
              <span className="eta">
                ETA: {Math.round(currentProgress.estimatedTimeRemaining / 1000)}s
              </span>
            )}
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${currentProgress.progress * 100}%` }}
            />
          </div>
          <span className="progress-percentage">
            {Math.round(currentProgress.progress * 100)}%
          </span>
        </div>

        <div className="processing-actions">
          {!isProcessing && !processingResult && selectedLandmarker && (
            <button onClick={startAIProcessing} className="start-processing-btn">
              Start AI Processing
            </button>
          )}
          {isProcessing && (
            <button onClick={() => setIsProcessing(false)} className="stop-processing-btn">
              Stop Processing
            </button>
          )}
        </div>
      </div>

      {/* Real-time Visualization */}
      {showVisualization && videoElement && selectedLandmarker && (
        <div className="visualization-section">
          <LandmarkerVisualization
            videoElement={videoElement}
            selectedLandmarker={selectedLandmarker}
            processingOptions={processingOptions}
            onProcessingResult={(result) => {
              // Handle real-time results for visualization
            }}
            onError={onError}
            showLandmarks={true}
            showConnections={true}
            showConfidence={true}
            realTimeMode={!isProcessing}
          />
        </div>
      )}

      {/* Processing Results */}
      {processingResult && (
        <div className="results-section">
          <div className="results-header">
            <h4>Processing Results</h4>
            <div className="quality-score">
              Quality Score: {Math.round(processingResult.qualityScore)}%
            </div>
          </div>

          <div className="results-summary">
            <div className="result-metric">
              <span className="metric-label">Processing Time:</span>
              <span className="metric-value">{Math.round(processingResult.processingTime / 1000)}s</span>
            </div>
            <div className="result-metric">
              <span className="metric-label">Frames Processed:</span>
              <span className="metric-value">{processingResult.landmarkerResults.results.length}</span>
            </div>
            <div className="result-metric">
              <span className="metric-label">Average FPS:</span>
              <span className="metric-value">{Math.round(processingResult.landmarkerResults.performance.frameRate)}</span>
            </div>
            <div className="result-metric">
              <span className="metric-label">Model Accuracy:</span>
              <span className="metric-value">{Math.round(processingResult.landmarkerResults.performance.accuracy * 100)}%</span>
            </div>
          </div>

          <div className="export-options">
            <h5>Export Animation Data</h5>
            <div className="export-buttons">
              {processingResult.exportData.json && (
                <button onClick={() => downloadExport('json')} className="export-btn">
                  📄 Download JSON
                </button>
              )}
              {processingResult.exportData.bvh && (
                <button onClick={() => downloadExport('bvh')} className="export-btn">
                  🎭 Download BVH
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Performance Metrics */}
      {showMetrics && (
        <div className="metrics-section">
          <PerformanceMetrics
            showRealTimeMetrics={true}
            showHistoricalData={false}
            autoRefresh={isProcessing}
            refreshInterval={1000}
          />
        </div>
      )}

      <style jsx>{`
        .ai-video-processor {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 24px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.1);
        }

        .processor-header h3 {
          margin: 0 0 8px 0;
          color: #1a1a1a;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .video-info {
          margin: 0;
          color: #666;
          font-size: 0.9rem;
        }

        .processing-status {
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .status-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .status-header h4 {
          margin: 0;
          color: #495057;
          font-size: 1rem;
          font-weight: 600;
        }

        .phase-indicator {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
        }

        .phase-indicator.loading { background: #e2e3e5; color: #383d41; }
        .phase-indicator.extracting { background: #d1ecf1; color: #0c5460; }
        .phase-indicator.processing { background: #fff3cd; color: #856404; }
        .phase-indicator.exporting { background: #d4edda; color: #155724; }
        .phase-indicator.complete { background: #d4edda; color: #155724; }

        .progress-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.9rem;
        }

        .current-step {
          color: #495057;
        }

        .eta {
          color: #007bff;
          font-weight: 500;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #e9ecef;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #007bff, #28a745);
          transition: width 0.3s ease;
        }

        .progress-percentage {
          align-self: flex-end;
          font-size: 0.8rem;
          font-weight: 500;
          color: #495057;
        }

        .processing-actions {
          margin-top: 16px;
          display: flex;
          gap: 8px;
        }

        .start-processing-btn {
          padding: 10px 20px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .start-processing-btn:hover {
          background: #0056b3;
        }

        .stop-processing-btn {
          padding: 10px 20px;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .stop-processing-btn:hover {
          background: #c82333;
        }

        .results-section {
          padding: 20px;
          background: #e8f5e8;
          border-radius: 8px;
          border-left: 4px solid #28a745;
        }

        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .results-header h4 {
          margin: 0;
          color: #155724;
          font-size: 1rem;
          font-weight: 600;
        }

        .quality-score {
          padding: 4px 8px;
          background: #28a745;
          color: white;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .results-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .result-metric {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: white;
          border-radius: 6px;
        }

        .metric-label {
          color: #6c757d;
          font-size: 0.85rem;
        }

        .metric-value {
          color: #155724;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .export-options h5 {
          margin: 0 0 12px 0;
          color: #155724;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .export-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .export-btn {
          padding: 8px 16px;
          background: white;
          color: #155724;
          border: 1px solid #c3e6cb;
          border-radius: 6px;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .export-btn:hover {
          background: #155724;
          color: white;
        }

        @media (max-width: 768px) {
          .ai-video-processor {
            padding: 16px;
            gap: 16px;
          }

          .progress-info {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }

          .results-summary {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};