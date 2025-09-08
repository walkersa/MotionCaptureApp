// Batch processing component with model comparison capabilities

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  LandmarkerType,
  ProcessingOptions,
  BatchLandmarkerResult,
  ModelComparison,
  LANDMARKER_CONFIGS
} from '../../types/landmarker';
import { useModelManager } from '../../utils/modelManager';
import { useLandmarkerProcessor } from '../../utils/landmarkerProcessor';
import { ProcessingPipelineFactory } from '../../utils/processingPipelines';
import { ProcessedVideo } from '../../types/video';

interface BatchProcessorProps {
  videos: ProcessedVideo[];
  onProcessingComplete?: (results: BatchProcessingResult[]) => void;
  onProgress?: (progress: BatchProgress) => void;
  onError?: (error: string) => void;
  enableComparison?: boolean;
  selectedLandmarkers?: LandmarkerType[];
}

interface BatchProcessingResult {
  videoId: string;
  videoName: string;
  results: BatchLandmarkerResult[];
  comparison?: ModelComparison;
  processingTime: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

interface BatchProgress {
  totalVideos: number;
  completedVideos: number;
  currentVideo: string;
  currentLandmarker: LandmarkerType;
  currentProgress: number;
  estimatedTimeRemaining: number;
}

export const BatchProcessor: React.FC<BatchProcessorProps> = ({
  videos,
  onProcessingComplete,
  onProgress,
  onError,
  enableComparison = true,
  selectedLandmarkers = ['pose', 'hand', 'face', 'holistic']
}) => {
  const { modelManager } = useModelManager();
  const { processBatch } = useLandmarkerProcessor();
  
  const [processingResults, setProcessingResults] = useState<BatchProcessingResult[]>([]);
  const [currentProgress, setCurrentProgress] = useState<BatchProgress>({
    totalVideos: 0,
    completedVideos: 0,
    currentVideo: '',
    currentLandmarker: 'pose',
    currentProgress: 0,
    estimatedTimeRemaining: 0
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStartTime, setProcessingStartTime] = useState(0);
  
  const workerPoolRef = useRef<Worker[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    initializeWorkerPool();
    return () => {
      cleanupWorkerPool();
    };
  }, []);

  useEffect(() => {
    // Initialize results when videos change
    const initialResults = videos.map(video => ({
      videoId: video.id,
      videoName: video.originalFile.name,
      results: [],
      processingTime: 0,
      status: 'pending' as const
    }));
    setProcessingResults(initialResults);
  }, [videos]);

  const initializeWorkerPool = useCallback(() => {
    const workerCount = Math.min(4, navigator.hardwareConcurrency || 4);
    
    for (let i = 0; i < workerCount; i++) {
      try {
        const worker = new Worker('/src/workers/landmarkerWorker.ts', { type: 'module' });
        workerPoolRef.current.push(worker);
      } catch (error) {
        console.error(`Failed to create worker ${i}:`, error);
      }
    }
  }, []);

  const cleanupWorkerPool = useCallback(() => {
    workerPoolRef.current.forEach(worker => {
      worker.terminate();
    });
    workerPoolRef.current = [];
  }, []);

  const startBatchProcessing = useCallback(async () => {
    if (videos.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setProcessingStartTime(performance.now());
    abortControllerRef.current = new AbortController();

    const totalTasks = videos.length * selectedLandmarkers.length;
    let completedTasks = 0;

    try {
      const results: BatchProcessingResult[] = [];

      // Process each video
      for (const video of videos) {
        const videoStartTime = performance.now();
        const videoResult: BatchProcessingResult = {
          videoId: video.id,
          videoName: video.originalFile.name,
          results: [],
          processingTime: 0,
          status: 'processing'
        };

        setCurrentProgress(prev => ({
          ...prev,
          currentVideo: video.originalFile.name,
          totalVideos: videos.length,
          completedVideos: results.length
        }));

        try {
          // Extract frames from video for processing
          const frames = await this.extractFramesFromVideo(video);
          
          // Process with each selected landmarker
          for (const landmarkerType of selectedLandmarkers) {
            if (abortControllerRef.current?.signal.aborted) {
              throw new Error('Processing aborted');
            }

            setCurrentProgress(prev => ({
              ...prev,
              currentLandmarker: landmarkerType,
              currentProgress: 0
            }));

            try {
              const processingOptions = this.getProcessingOptions(landmarkerType);
              
              const batchResult = await processBatch(
                frames,
                landmarkerType,
                processingOptions,
                (progress, currentFrame) => {
                  setCurrentProgress(prev => ({
                    ...prev,
                    currentProgress: progress,
                    estimatedTimeRemaining: this.calculateETA(
                      completedTasks, 
                      totalTasks, 
                      performance.now() - processingStartTime
                    )
                  }));
                  
                  onProgress?.({
                    ...currentProgress,
                    currentProgress: progress,
                    estimatedTimeRemaining: this.calculateETA(
                      completedTasks,
                      totalTasks,
                      performance.now() - processingStartTime
                    )
                  });
                }
              );

              videoResult.results.push(batchResult);
              completedTasks++;
              
            } catch (error) {
              console.error(`Failed to process ${landmarkerType} for video ${video.id}:`, error);
              // Continue with other landmarkers
            }
          }

          // Generate comparison if enabled and multiple landmarkers used
          if (enableComparison && videoResult.results.length > 1) {
            videoResult.comparison = this.generateModelComparison(videoResult.results, video.id);
          }

          videoResult.processingTime = performance.now() - videoStartTime;
          videoResult.status = 'completed';
          
        } catch (error) {
          videoResult.status = 'failed';
          videoResult.error = error instanceof Error ? error.message : 'Processing failed';
          console.error(`Failed to process video ${video.id}:`, error);
        }

        results.push(videoResult);
        
        setProcessingResults(prev => 
          prev.map(r => r.videoId === video.id ? videoResult : r)
        );
      }

      setCurrentProgress(prev => ({
        ...prev,
        completedVideos: videos.length,
        currentProgress: 1,
        estimatedTimeRemaining: 0
      }));

      onProcessingComplete?.(results);
      
    } catch (error) {
      console.error('Batch processing failed:', error);
      onError?.(error instanceof Error ? error.message : 'Batch processing failed');
    } finally {
      setIsProcessing(false);
    }
  }, [videos, selectedLandmarkers, isProcessing, enableComparison, processBatch, onProcessingComplete, onProgress, onError]);

  private extractFramesFromVideo = async (video: ProcessedVideo): Promise<Array<{ imageData: ImageData; timestamp: number; frameIndex: number }>> => {
    return new Promise((resolve, reject) => {
      const videoElement = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      videoElement.onloadedmetadata = () => {
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        
        const frames: Array<{ imageData: ImageData; timestamp: number; frameIndex: number }> = [];
        const fps = 30; // Extract at 30fps
        const duration = videoElement.duration;
        const frameCount = Math.floor(duration * fps);
        
        let currentFrame = 0;
        
        const extractFrame = () => {
          if (currentFrame >= frameCount) {
            resolve(frames);
            return;
          }
          
          const timestamp = (currentFrame / fps) * 1000;
          videoElement.currentTime = currentFrame / fps;
          
          videoElement.onseeked = () => {
            ctx.drawImage(videoElement, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            frames.push({
              imageData,
              timestamp,
              frameIndex: currentFrame
            });
            
            currentFrame++;
            setTimeout(extractFrame, 1); // Small delay to allow processing
          };
        };
        
        extractFrame();
      };
      
      videoElement.onerror = () => reject(new Error('Failed to load video'));
      videoElement.src = URL.createObjectURL(video.originalFile);
    });
  };

  private getProcessingOptions = (landmarkerType: LandmarkerType): ProcessingOptions => {
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

  private generateModelComparison = (results: BatchLandmarkerResult[], videoId: string): ModelComparison => {
    const comparisonResults = results.map(result => ({
      landmarkerType: result.landmarkerType,
      result,
      score: this.calculateOverallScore(result)
    }));

    // Find best performers
    const bestAccuracy = comparisonResults.reduce((best, current) =>
      current.result.performance.accuracy > best.result.performance.accuracy ? current : best
    );

    const bestSpeed = comparisonResults.reduce((best, current) =>
      current.result.performance.frameRate > best.result.performance.frameRate ? current : best
    );

    const bestForGame = this.determineBestForGameUse(comparisonResults);

    return {
      videoId,
      results: comparisonResults,
      recommendation: {
        bestForAccuracy: bestAccuracy.landmarkerType,
        bestForSpeed: bestSpeed.landmarkerType,
        bestForGameUse: bestForGame.landmarkerType,
        reasoning: `Based on performance analysis: ${bestAccuracy.landmarkerType} achieved highest accuracy (${Math.round(bestAccuracy.result.performance.accuracy * 100)}%), ${bestSpeed.landmarkerType} achieved highest FPS (${Math.round(bestSpeed.result.performance.frameRate)}), and ${bestForGame.landmarkerType} provides the best balance for game development.`
      }
    };
  };

  private calculateOverallScore = (result: BatchLandmarkerResult): number => {
    const accuracy = result.performance.accuracy * 100;
    const speed = Math.min(100, result.performance.frameRate * 2); // Normalize to 100
    const reliability = (1 - result.performance.droppedFrames / result.performance.totalFrames) * 100;
    
    return (accuracy * 0.4 + speed * 0.3 + reliability * 0.3);
  };

  private determineBestForGameUse = (results: Array<{ landmarkerType: LandmarkerType; result: BatchLandmarkerResult; score: number }>): { landmarkerType: LandmarkerType } => {
    // Prioritize based on game development needs
    const gameScores = results.map(r => ({
      ...r,
      gameScore: this.calculateGameScore(r.landmarkerType, r.result)
    }));

    const best = gameScores.reduce((best, current) =>
      current.gameScore > best.gameScore ? current : best
    );

    return { landmarkerType: best.landmarkerType };
  };

  private calculateGameScore = (landmarkerType: LandmarkerType, result: BatchLandmarkerResult): number => {
    const config = LANDMARKER_CONFIGS[landmarkerType];
    let score = 0;

    // Base score from configuration
    score += config.accuracy * 0.3;
    score += Math.min(100, config.speed * 2) * 0.2;

    // Performance bonus
    score += result.performance.accuracy * 50 * 0.3;
    score += Math.min(50, result.performance.frameRate) * 0.2;

    return score;
  };

  private calculateETA = (completed: number, total: number, elapsedTime: number): number => {
    if (completed === 0) return 0;
    const rate = completed / elapsedTime;
    const remaining = total - completed;
    return remaining / rate;
  };

  const stopProcessing = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsProcessing(false);
  }, []);

  const retryFailedVideos = useCallback(() => {
    const failedVideos = videos.filter(video => 
      processingResults.find(result => result.videoId === video.id)?.status === 'failed'
    );
    
    if (failedVideos.length > 0) {
      // Reset failed results to pending and restart processing
      setProcessingResults(prev => 
        prev.map(result => 
          result.status === 'failed' ? { ...result, status: 'pending', error: undefined } : result
        )
      );
      
      // Restart processing for failed videos only
      // This would be a modified version of startBatchProcessing
    }
  }, [videos, processingResults]);

  return (
    <div className="batch-processor">
      <div className="batch-processor-header">
        <h3>Batch Processing</h3>
        <p className="description">
          Process multiple videos with different AI models and compare results for optimal game development workflows.
        </p>
      </div>

      <div className="landmarker-selection">
        <h4>Selected Models:</h4>
        <div className="landmarker-chips">
          {selectedLandmarkers.map(type => (
            <div key={type} className="landmarker-chip">
              <span className="chip-label">{LANDMARKER_CONFIGS[type].displayName}</span>
              <span className="chip-count">{LANDMARKER_CONFIGS[type].landmarks} landmarks</span>
            </div>
          ))}
        </div>
      </div>

      {isProcessing && (
        <div className="progress-section">
          <div className="overall-progress">
            <div className="progress-header">
              <span>Processing Videos: {currentProgress.completedVideos} / {currentProgress.totalVideos}</span>
              <span className="eta">
                {currentProgress.estimatedTimeRemaining > 0 && 
                  `ETA: ${Math.round(currentProgress.estimatedTimeRemaining / 1000)}s`
                }
              </span>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ 
                  width: `${(currentProgress.completedVideos / currentProgress.totalVideos) * 100}%` 
                }}
              />
            </div>
          </div>

          <div className="current-task">
            <div className="task-info">
              <span className="current-video">Video: {currentProgress.currentVideo}</span>
              <span className="current-model">Model: {LANDMARKER_CONFIGS[currentProgress.currentLandmarker].displayName}</span>
            </div>
            <div className="task-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${currentProgress.currentProgress * 100}%` }}
                />
              </div>
              <span className="progress-percentage">
                {Math.round(currentProgress.currentProgress * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="results-section">
        <div className="results-header">
          <h4>Processing Results</h4>
          <div className="result-actions">
            {!isProcessing ? (
              <button 
                onClick={startBatchProcessing}
                disabled={videos.length === 0}
                className="process-button primary"
              >
                Start Processing
              </button>
            ) : (
              <button 
                onClick={stopProcessing}
                className="process-button secondary"
              >
                Stop Processing
              </button>
            )}
            
            {processingResults.some(r => r.status === 'failed') && (
              <button 
                onClick={retryFailedVideos}
                disabled={isProcessing}
                className="process-button secondary"
              >
                Retry Failed
              </button>
            )}
          </div>
        </div>

        <div className="results-list">
          {processingResults.map(result => (
            <div key={result.videoId} className={`result-item ${result.status}`}>
              <div className="result-header">
                <span className="video-name">{result.videoName}</span>
                <span className={`status-badge ${result.status}`}>
                  {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
                </span>
              </div>

              {result.status === 'completed' && result.results.length > 0 && (
                <div className="result-details">
                  <div className="landmarker-results">
                    {result.results.map(lr => (
                      <div key={lr.landmarkerType} className="landmarker-result">
                        <span className="landmarker-name">
                          {LANDMARKER_CONFIGS[lr.landmarkerType].displayName}
                        </span>
                        <div className="result-metrics">
                          <span>Accuracy: {Math.round(lr.performance.accuracy * 100)}%</span>
                          <span>FPS: {Math.round(lr.performance.frameRate)}</span>
                          <span>Frames: {lr.results.length}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {result.comparison && (
                    <div className="comparison-summary">
                      <h5>Recommendations:</h5>
                      <div className="recommendations">
                        <span>🎯 Best Accuracy: {LANDMARKER_CONFIGS[result.comparison.recommendation.bestForAccuracy].displayName}</span>
                        <span>⚡ Best Speed: {LANDMARKER_CONFIGS[result.comparison.recommendation.bestForSpeed].displayName}</span>
                        <span>🎮 Best for Games: {LANDMARKER_CONFIGS[result.comparison.recommendation.bestForGameUse].displayName}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {result.status === 'failed' && result.error && (
                <div className="error-details">
                  <span className="error-message">Error: {result.error}</span>
                </div>
              )}

              {result.status === 'processing' && (
                <div className="processing-indicator">
                  <div className="spinner" />
                  <span>Processing with {selectedLandmarkers.length} models...</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .batch-processor {
          padding: 24px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.1);
        }

        .batch-processor-header h3 {
          margin: 0 0 8px 0;
          color: #1a1a1a;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .description {
          margin: 0 0 24px 0;
          color: #666;
          font-size: 0.9rem;
        }

        .landmarker-selection {
          margin-bottom: 24px;
        }

        .landmarker-selection h4 {
          margin: 0 0 12px 0;
          color: #1a1a1a;
          font-size: 1rem;
          font-weight: 600;
        }

        .landmarker-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .landmarker-chip {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 12px;
          background: #e3f2fd;
          border: 1px solid #90caf9;
          border-radius: 8px;
        }

        .chip-label {
          font-size: 0.85rem;
          font-weight: 500;
          color: #1565c0;
        }

        .chip-count {
          font-size: 0.7rem;
          color: #1976d2;
        }

        .progress-section {
          margin-bottom: 24px;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .overall-progress {
          margin-bottom: 16px;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-size: 0.9rem;
          color: #495057;
        }

        .eta {
          font-weight: 500;
          color: #007bff;
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

        .current-task {
          padding-top: 16px;
          border-top: 1px solid #dee2e6;
        }

        .task-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 0.85rem;
          color: #6c757d;
        }

        .task-progress {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .task-progress .progress-bar {
          flex: 1;
        }

        .progress-percentage {
          font-size: 0.8rem;
          font-weight: 500;
          color: #495057;
          min-width: 40px;
          text-align: right;
        }

        .results-section {
          margin-top: 24px;
        }

        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .results-header h4 {
          margin: 0;
          color: #1a1a1a;
          font-size: 1rem;
          font-weight: 600;
        }

        .result-actions {
          display: flex;
          gap: 8px;
        }

        .process-button {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .process-button.primary {
          background: #007bff;
          color: white;
        }

        .process-button.primary:hover:not(:disabled) {
          background: #0056b3;
        }

        .process-button.secondary {
          background: #f8f9fa;
          color: #495057;
          border: 1px solid #dee2e6;
        }

        .process-button.secondary:hover:not(:disabled) {
          background: #e9ecef;
        }

        .process-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .results-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .result-item {
          padding: 16px;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          background: white;
        }

        .result-item.completed {
          border-color: #28a745;
          background: #f8fff9;
        }

        .result-item.failed {
          border-color: #dc3545;
          background: #fff8f8;
        }

        .result-item.processing {
          border-color: #ffc107;
          background: #fffdf5;
        }

        .result-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .video-name {
          font-weight: 500;
          color: #1a1a1a;
        }

        .status-badge {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
        }

        .status-badge.completed {
          background: #d4edda;
          color: #155724;
        }

        .status-badge.failed {
          background: #f8d7da;
          color: #721c24;
        }

        .status-badge.processing {
          background: #fff3cd;
          color: #856404;
        }

        .status-badge.pending {
          background: #e2e3e5;
          color: #383d41;
        }

        .result-details {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .landmarker-results {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .landmarker-result {
          padding: 12px;
          background: #f8f9fa;
          border-radius: 6px;
        }

        .landmarker-name {
          display: block;
          font-weight: 500;
          color: #495057;
          margin-bottom: 8px;
        }

        .result-metrics {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.8rem;
          color: #6c757d;
        }

        .comparison-summary {
          padding: 16px;
          background: #e8f5e8;
          border-radius: 6px;
        }

        .comparison-summary h5 {
          margin: 0 0 12px 0;
          color: #155724;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .recommendations {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.85rem;
          color: #155724;
        }

        .error-details {
          padding: 12px;
          background: #f8d7da;
          border-radius: 6px;
        }

        .error-message {
          color: #721c24;
          font-size: 0.9rem;
        }

        .processing-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #856404;
          font-size: 0.9rem;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #fff3cd;
          border-top: 2px solid #ffc107;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .results-header {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }

          .result-actions {
            justify-content: stretch;
          }

          .process-button {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
};