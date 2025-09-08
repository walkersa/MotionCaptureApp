// Real-time processing component with landmark visualization

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DrawingUtils } from '@mediapipe/drawing_utils';
import {
  LandmarkerType,
  LandmarkerResult,
  ProcessingOptions,
  LANDMARKER_CONFIGS
} from '../../types/landmarker';
import { useModelManager } from '../../utils/modelManager';
import { useLandmarkerProcessor } from '../../utils/landmarkerProcessor';

interface LandmarkerVisualizationProps {
  videoElement: HTMLVideoElement | null;
  selectedLandmarker: LandmarkerType | null;
  processingOptions: ProcessingOptions | null;
  onProcessingResult?: (result: LandmarkerResult) => void;
  onError?: (error: string) => void;
  showLandmarks?: boolean;
  showConnections?: boolean;
  showConfidence?: boolean;
  realTimeMode?: boolean;
}

export const LandmarkerVisualization: React.FC<LandmarkerVisualizationProps> = ({
  videoElement,
  selectedLandmarker,
  processingOptions,
  onProcessingResult,
  onError,
  showLandmarks = true,
  showConnections = true,
  showConfidence = true,
  realTimeMode = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  
  const { modelManager } = useModelManager();
  const { processFrame } = useLandmarkerProcessor();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentResult, setCurrentResult] = useState<LandmarkerResult | null>(null);
  const [processingStats, setProcessingStats] = useState({
    fps: 0,
    avgProcessingTime: 0,
    confidence: 0,
    frameCount: 0
  });
  const [lastProcessingTime, setLastProcessingTime] = useState(0);

  useEffect(() => {
    initializeDrawingUtils();
    initializeWorker();
    
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (videoElement && selectedLandmarker && realTimeMode) {
      startRealTimeProcessing();
    } else {
      stopRealTimeProcessing();
    }
  }, [videoElement, selectedLandmarker, realTimeMode]);

  useEffect(() => {
    if (currentResult) {
      drawVisualization();
      updateProcessingStats();
      onProcessingResult?.(currentResult);
    }
  }, [currentResult, showLandmarks, showConnections, showConfidence]);

  const initializeDrawingUtils = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawingUtilsRef.current = new DrawingUtils(ctx);
      }
    }
  }, []);

  const initializeWorker = useCallback(() => {
    try {
      workerRef.current = new Worker('/src/workers/landmarkerWorker.ts', { type: 'module' });
      
      workerRef.current.onmessage = (event) => {
        const { type, payload } = event.data;
        
        switch (type) {
          case 'complete':
            if (payload.type) {
              // This is a processing result
              setCurrentResult(payload as LandmarkerResult);
            }
            break;
            
          case 'error':
            console.error('Landmarker worker error:', payload.error);
            onError?.(payload.error);
            break;
            
          case 'progress':
            // Handle progress updates
            break;
        }
      };

      workerRef.current.onerror = (error) => {
        console.error('Worker error:', error);
        onError?.('Worker initialization failed');
      };
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      onError?.('Failed to initialize processing worker');
    }
  }, [onError]);

  const startRealTimeProcessing = useCallback(async () => {
    if (!videoElement || !selectedLandmarker || !processingOptions) return;
    
    setIsProcessing(true);
    
    try {
      // Ensure model is loaded
      const loadResult = await modelManager.loadLandmarker(selectedLandmarker, processingOptions);
      if (!loadResult.success) {
        throw new Error(loadResult.error);
      }

      // Load model in worker
      if (workerRef.current) {
        workerRef.current.postMessage({
          id: 'load-model',
          type: 'load-model',
          payload: {
            landmarkerType: selectedLandmarker,
            options: processingOptions
          }
        });
      }

      // Start processing loop
      processVideoFrame();
    } catch (error) {
      console.error('Failed to start real-time processing:', error);
      onError?.(error instanceof Error ? error.message : 'Processing failed');
      setIsProcessing(false);
    }
  }, [videoElement, selectedLandmarker, processingOptions, modelManager, onError]);

  const processVideoFrame = useCallback(() => {
    if (!videoElement || !selectedLandmarker || !isProcessing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    // Draw video frame
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    // Get image data for processing
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Send to worker for processing
    if (workerRef.current) {
      workerRef.current.postMessage({
        id: 'process-frame',
        type: 'process-frame',
        payload: {
          imageData,
          landmarkerType: selectedLandmarker,
          timestamp: videoElement.currentTime * 1000,
          frameIndex: Math.floor(videoElement.currentTime * 30) // Assume 30fps
        }
      });
    }

    // Schedule next frame
    animationFrameRef.current = requestAnimationFrame(() => {
      setTimeout(processVideoFrame, 1000 / 30); // Process at 30fps max
    });
  }, [videoElement, selectedLandmarker, isProcessing]);

  const stopRealTimeProcessing = useCallback(() => {
    setIsProcessing(false);
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const drawVisualization = useCallback(() => {
    const canvas = canvasRef.current;
    const drawingUtils = drawingUtilsRef.current;
    
    if (!canvas || !drawingUtils || !currentResult) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous drawings (keep video frame)
    if (!realTimeMode && videoElement) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    }

    // Draw landmarks based on type
    switch (currentResult.type) {
      case 'pose':
        drawPoseLandmarks(ctx, drawingUtils, currentResult);
        break;
      case 'hand':
        drawHandLandmarks(ctx, drawingUtils, currentResult);
        break;
      case 'face':
        drawFaceLandmarks(ctx, drawingUtils, currentResult);
        break;
      case 'holistic':
        drawHolisticLandmarks(ctx, drawingUtils, currentResult);
        break;
    }

    // Draw confidence overlay
    if (showConfidence) {
      drawConfidenceOverlay(ctx, currentResult);
    }
  }, [currentResult, showLandmarks, showConnections, showConfidence, realTimeMode, videoElement]);

  const drawPoseLandmarks = (ctx: CanvasRenderingContext2D, drawingUtils: DrawingUtils, result: LandmarkerResult) => {
    if (!result.pose?.landmarks || !showLandmarks) return;

    const landmarks = result.pose.landmarks;
    
    // Draw landmarks
    landmarks.forEach((landmark: any, index: number) => {
      const x = landmark.x * ctx.canvas.width;
      const y = landmark.y * ctx.canvas.height;
      
      ctx.fillStyle = this.getLandmarkColor(landmark.visibility || 1);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw landmark index
      ctx.fillStyle = 'white';
      ctx.font = '10px Arial';
      ctx.fillText(index.toString(), x + 5, y - 5);
    });

    // Draw connections
    if (showConnections) {
      this.drawPoseConnections(ctx, landmarks);
    }
  };

  const drawHandLandmarks = (ctx: CanvasRenderingContext2D, drawingUtils: DrawingUtils, result: LandmarkerResult) => {
    if (!result.hands || !showLandmarks) return;

    result.hands.forEach((hand, handIndex) => {
      const landmarks = hand.landmarks;
      const color = handIndex === 0 ? '#00FF00' : '#0000FF'; // Green for first hand, blue for second
      
      // Draw landmarks
      landmarks.forEach((landmark: any, index: number) => {
        const x = landmark.x * ctx.canvas.width;
        const y = landmark.y * ctx.canvas.height;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Draw connections
      if (showConnections) {
        this.drawHandConnections(ctx, landmarks, color);
      }

      // Draw handedness label
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.fillText(
        hand.handedness, 
        landmarks[0].x * ctx.canvas.width - 20, 
        landmarks[0].y * ctx.canvas.height - 10
      );
    });
  };

  const drawFaceLandmarks = (ctx: CanvasRenderingContext2D, drawingUtils: DrawingUtils, result: LandmarkerResult) => {
    if (!result.face?.landmarks || !showLandmarks) return;

    const landmarks = result.face.landmarks;
    
    // Draw face mesh (simplified - only key points)
    const keyIndices = [10, 151, 9, 8, 168, 6, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288];
    
    keyIndices.forEach(index => {
      if (landmarks[index]) {
        const landmark = landmarks[index];
        const x = landmark.x * ctx.canvas.width;
        const y = landmark.y * ctx.canvas.height;
        
        ctx.fillStyle = '#FF6B6B';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    // Draw face contour
    if (showConnections) {
      this.drawFaceContour(ctx, landmarks);
    }
  };

  const drawHolisticLandmarks = (ctx: CanvasRenderingContext2D, drawingUtils: DrawingUtils, result: LandmarkerResult) => {
    if (!result.holistic) return;

    // Draw pose
    if (result.holistic.pose) {
      const poseResult = { ...result, pose: result.holistic.pose, type: 'pose' as LandmarkerType };
      drawPoseLandmarks(ctx, drawingUtils, poseResult);
    }

    // Draw hands
    if (result.holistic.hands) {
      const handResult = { ...result, hands: result.holistic.hands, type: 'hand' as LandmarkerType };
      drawHandLandmarks(ctx, drawingUtils, handResult);
    }

    // Draw face
    if (result.holistic.face) {
      const faceResult = { ...result, face: result.holistic.face, type: 'face' as LandmarkerType };
      drawFaceLandmarks(ctx, drawingUtils, faceResult);
    }
  };

  private drawPoseConnections = (ctx: CanvasRenderingContext2D, landmarks: any[]) => {
    const connections = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
      [24, 26], [26, 28], [15, 17], [17, 19], [16, 18], [18, 20]
    ];

    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    
    connections.forEach(([startIdx, endIdx]) => {
      if (landmarks[startIdx] && landmarks[endIdx]) {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];
        
        ctx.beginPath();
        ctx.moveTo(start.x * ctx.canvas.width, start.y * ctx.canvas.height);
        ctx.lineTo(end.x * ctx.canvas.width, end.y * ctx.canvas.height);
        ctx.stroke();
      }
    });
  };

  private drawHandConnections = (ctx: CanvasRenderingContext2D, landmarks: any[], color: string) => {
    const fingerConnections = [
      // Thumb
      [0, 1], [1, 2], [2, 3], [3, 4],
      // Index
      [0, 5], [5, 6], [6, 7], [7, 8],
      // Middle
      [0, 9], [9, 10], [10, 11], [11, 12],
      // Ring
      [0, 13], [13, 14], [14, 15], [15, 16],
      // Pinky
      [0, 17], [17, 18], [18, 19], [19, 20]
    ];

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    
    fingerConnections.forEach(([startIdx, endIdx]) => {
      if (landmarks[startIdx] && landmarks[endIdx]) {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];
        
        ctx.beginPath();
        ctx.moveTo(start.x * ctx.canvas.width, start.y * ctx.canvas.height);
        ctx.lineTo(end.x * ctx.canvas.width, end.y * ctx.canvas.height);
        ctx.stroke();
      }
    });
  };

  private drawFaceContour = (ctx: CanvasRenderingContext2D, landmarks: any[]) => {
    const contourIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
    
    ctx.strokeStyle = '#FF6B6B';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    contourIndices.forEach((index, i) => {
      if (landmarks[index]) {
        const landmark = landmarks[index];
        const x = landmark.x * ctx.canvas.width;
        const y = landmark.y * ctx.canvas.height;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.closePath();
    ctx.stroke();
  };

  private getLandmarkColor = (visibility: number): string => {
    const alpha = Math.max(0.3, visibility);
    return `rgba(255, 107, 107, ${alpha})`;
  };

  const drawConfidenceOverlay = (ctx: CanvasRenderingContext2D, result: LandmarkerResult) => {
    const confidence = Math.round(result.confidence * 100);
    
    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 150, 60);
    
    // Text
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.fillText(`Confidence: ${confidence}%`, 15, 30);
    ctx.fillText(`FPS: ${processingStats.fps}`, 15, 50);
  };

  const updateProcessingStats = useCallback(() => {
    if (!currentResult) return;

    const now = performance.now();
    const timeDelta = now - lastProcessingTime;
    const fps = timeDelta > 0 ? 1000 / timeDelta : 0;

    setProcessingStats(prev => {
      const newFrameCount = prev.frameCount + 1;
      const newAvgProcessingTime = (prev.avgProcessingTime * prev.frameCount + currentResult.processingTime) / newFrameCount;
      const newAvgConfidence = (prev.confidence * prev.frameCount + currentResult.confidence) / newFrameCount;

      return {
        fps: Math.round(fps),
        avgProcessingTime: Math.round(newAvgProcessingTime),
        confidence: Math.round(newAvgConfidence * 100),
        frameCount: newFrameCount
      };
    });

    setLastProcessingTime(now);
  }, [currentResult, lastProcessingTime]);

  const cleanup = useCallback(() => {
    stopRealTimeProcessing();
    
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, [stopRealTimeProcessing]);

  const toggleVisualizationMode = (mode: 'landmarks' | 'connections' | 'confidence') => {
    // This would be handled by parent component
    console.log(`Toggle ${mode} visualization`);
  };

  return (
    <div className="landmarker-visualization">
      <div className="visualization-canvas-container">
        <canvas
          ref={canvasRef}
          className="visualization-canvas"
          width={640}
          height={480}
        />
        
        {isProcessing && (
          <div className="processing-indicator">
            <div className="spinner" />
            <span>Processing...</span>
          </div>
        )}
      </div>

      <div className="visualization-controls">
        <div className="toggle-controls">
          <label>
            <input
              type="checkbox"
              checked={showLandmarks}
              onChange={() => toggleVisualizationMode('landmarks')}
            />
            Show Landmarks
          </label>
          
          <label>
            <input
              type="checkbox"
              checked={showConnections}
              onChange={() => toggleVisualizationMode('connections')}
            />
            Show Connections
          </label>
          
          <label>
            <input
              type="checkbox"
              checked={showConfidence}
              onChange={() => toggleVisualizationMode('confidence')}
            />
            Show Confidence
          </label>
        </div>

        <div className="processing-stats">
          <div className="stat-item">
            <span className="stat-label">FPS:</span>
            <span className="stat-value">{processingStats.fps}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Avg Time:</span>
            <span className="stat-value">{processingStats.avgProcessingTime}ms</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Confidence:</span>
            <span className="stat-value">{processingStats.confidence}%</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Frames:</span>
            <span className="stat-value">{processingStats.frameCount}</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .landmarker-visualization {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 20px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.1);
        }

        .visualization-canvas-container {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
        }

        .visualization-canvas {
          max-width: 100%;
          max-height: 480px;
          display: block;
        }

        .processing-indicator {
          position: absolute;
          top: 10px;
          right: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #f3f3f3;
          border-top: 2px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .visualization-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .toggle-controls {
          display: flex;
          gap: 16px;
        }

        .toggle-controls label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.9rem;
          cursor: pointer;
        }

        .toggle-controls input[type="checkbox"] {
          margin: 0;
        }

        .processing-stats {
          display: flex;
          gap: 16px;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .stat-label {
          font-size: 0.7rem;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-size: 0.9rem;
          font-weight: 600;
          color: #1a1a1a;
        }

        @media (max-width: 768px) {
          .visualization-controls {
            flex-direction: column;
            gap: 12px;
          }

          .toggle-controls {
            flex-wrap: wrap;
          }

          .processing-stats {
            flex-wrap: wrap;
            justify-content: center;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
};