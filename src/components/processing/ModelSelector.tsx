// Model selector UI component with performance comparisons

import React, { useState, useEffect, useCallback } from 'react';
import {
  LandmarkerType,
  LandmarkerConfig,
  LANDMARKER_CONFIGS,
  ProcessingOptions,
  LandmarkerPerformance
} from '../../types/landmarker';
import { useModelManager } from '../../utils/modelManager';
import { useLandmarkerProcessor } from '../../utils/landmarkerProcessor';

interface ModelSelectorProps {
  selectedModel: LandmarkerType | null;
  onModelSelect: (model: LandmarkerType, options: ProcessingOptions) => void;
  onModelLoad: (model: LandmarkerType, loading: boolean) => void;
  disabled?: boolean;
  showPerformance?: boolean;
}

interface ModelLoadingState {
  [key in LandmarkerType]: {
    loading: boolean;
    loaded: boolean;
    error?: string;
    loadTime?: number;
  };
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelSelect,
  onModelLoad,
  disabled = false,
  showPerformance = true
}) => {
  const { modelManager, getSystemCapabilities } = useModelManager();
  const { getPerformanceMetrics } = useLandmarkerProcessor();
  
  const [loadingStates, setLoadingStates] = useState<ModelLoadingState>(() => ({
    pose: { loading: false, loaded: false },
    hand: { loading: false, loaded: false },
    face: { loading: false, loaded: false },
    holistic: { loading: false, loaded: false }
  }));
  
  const [systemCapabilities, setSystemCapabilities] = useState<any>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<Map<LandmarkerType, LandmarkerPerformance>>(new Map());
  const [processingOptions, setProcessingOptions] = useState<Record<LandmarkerType, ProcessingOptions>>(() => {
    const options: Record<LandmarkerType, ProcessingOptions> = {} as any;
    Object.keys(LANDMARKER_CONFIGS).forEach(type => {
      const landmarkerType = type as LandmarkerType;
      const config = LANDMARKER_CONFIGS[landmarkerType];
      options[landmarkerType] = {
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
    });
    return options;
  });

  useEffect(() => {
    loadSystemCapabilities();
    updateLoadingStates();
    updatePerformanceMetrics();
  }, []);

  const loadSystemCapabilities = useCallback(async () => {
    try {
      const capabilities = await getSystemCapabilities();
      setSystemCapabilities(capabilities);
    } catch (error) {
      console.error('Failed to get system capabilities:', error);
    }
  }, [getSystemCapabilities]);

  const updateLoadingStates = useCallback(() => {
    const newStates: ModelLoadingState = {} as any;
    Object.keys(LANDMARKER_CONFIGS).forEach(type => {
      const landmarkerType = type as LandmarkerType;
      newStates[landmarkerType] = {
        loading: false,
        loaded: modelManager.isLandmarkerLoaded(landmarkerType)
      };
    });
    setLoadingStates(newStates);
  }, [modelManager]);

  const updatePerformanceMetrics = useCallback(() => {
    const metrics = new Map<LandmarkerType, LandmarkerPerformance>();
    Object.keys(LANDMARKER_CONFIGS).forEach(type => {
      const landmarkerType = type as LandmarkerType;
      const metric = getPerformanceMetrics(landmarkerType);
      if (metric) {
        metrics.set(landmarkerType, metric);
      }
    });
    setPerformanceMetrics(metrics);
  }, [getPerformanceMetrics]);

  const handleModelSelect = useCallback(async (landmarkerType: LandmarkerType) => {
    if (disabled || loadingStates[landmarkerType].loading) return;

    // Update loading state
    setLoadingStates(prev => ({
      ...prev,
      [landmarkerType]: { ...prev[landmarkerType], loading: true, error: undefined }
    }));

    onModelLoad(landmarkerType, true);

    try {
      const loadResult = await modelManager.loadLandmarker(landmarkerType, processingOptions[landmarkerType]);
      
      if (loadResult.success) {
        setLoadingStates(prev => ({
          ...prev,
          [landmarkerType]: { 
            ...prev[landmarkerType], 
            loading: false, 
            loaded: true,
            loadTime: loadResult.loadTime
          }
        }));
        
        onModelSelect(landmarkerType, processingOptions[landmarkerType]);
      } else {
        setLoadingStates(prev => ({
          ...prev,
          [landmarkerType]: { 
            ...prev[landmarkerType], 
            loading: false, 
            error: loadResult.error 
          }
        }));
      }
    } catch (error) {
      setLoadingStates(prev => ({
        ...prev,
        [landmarkerType]: { 
          ...prev[landmarkerType], 
          loading: false, 
          error: error instanceof Error ? error.message : 'Failed to load model'
        }
      }));
    }

    onModelLoad(landmarkerType, false);
  }, [disabled, loadingStates, modelManager, onModelLoad, onModelSelect, processingOptions]);

  const handleParameterChange = useCallback((
    landmarkerType: LandmarkerType,
    parameterPath: string,
    value: any
  ) => {
    setProcessingOptions(prev => {
      const updated = { ...prev };
      const keys = parameterPath.split('.');
      let target = updated[landmarkerType] as any;
      
      for (let i = 0; i < keys.length - 1; i++) {
        target = target[keys[i]];
      }
      target[keys[keys.length - 1]] = value;
      
      return updated;
    });
  }, []);

  const getQualityScore = (config: LandmarkerConfig, performance?: LandmarkerPerformance): number => {
    let score = config.accuracy;
    if (performance) {
      // Adjust score based on actual performance
      const speedBonus = Math.min(10, performance.frameRate - config.speed);
      score = Math.min(100, score + speedBonus);
    }
    return score;
  };

  const getRecommendationBadge = (landmarkerType: LandmarkerType): string | null => {
    if (!systemCapabilities) return null;
    
    if (systemCapabilities.recommendedLandmarkerType === landmarkerType) {
      return 'Recommended';
    }
    
    const config = LANDMARKER_CONFIGS[landmarkerType];
    if (config.memoryRequirement > systemCapabilities.memoryStatus.limits.maxFileSize / (1024 * 1024)) {
      return 'High Memory';
    }
    
    return null;
  };

  const formatPerformanceMetric = (value: number, unit: string): string => {
    if (value < 1 && unit !== '%') {
      return `${(value * 1000).toFixed(1)}m${unit}`;
    }
    return `${value.toFixed(1)}${unit}`;
  };

  return (
    <div className="model-selector">
      <div className="model-selector-header">
        <h3>AI Model Selection</h3>
        <p className="description">
          Choose the AI model that best fits your motion capture needs. Each model is optimized for specific use cases.
        </p>
      </div>

      {systemCapabilities && (
        <div className="system-info">
          <div className="system-status">
            <span className={`webgl-status ${systemCapabilities.webglSupported ? 'supported' : 'not-supported'}`}>
              WebGL: {systemCapabilities.webglSupported ? 'Supported' : 'Not Available'}
            </span>
            <span className="memory-status">
              Available Memory: {Math.round(systemCapabilities.memoryStatus.usage.available / (1024 * 1024))}MB
            </span>
          </div>
        </div>
      )}

      <div className="model-grid">
        {Object.entries(LANDMARKER_CONFIGS).map(([type, config]) => {
          const landmarkerType = type as LandmarkerType;
          const loadingState = loadingStates[landmarkerType];
          const performance = performanceMetrics.get(landmarkerType);
          const isSelected = selectedModel === landmarkerType;
          const recommendationBadge = getRecommendationBadge(landmarkerType);
          const qualityScore = getQualityScore(config, performance);

          return (
            <div
              key={landmarkerType}
              className={`model-card ${isSelected ? 'selected' : ''} ${loadingState.loading ? 'loading' : ''}`}
              onClick={() => handleModelSelect(landmarkerType)}
              style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
            >
              {recommendationBadge && (
                <div className={`recommendation-badge ${recommendationBadge.toLowerCase().replace(' ', '-')}`}>
                  {recommendationBadge}
                </div>
              )}

              <div className="model-header">
                <h4>{config.displayName}</h4>
                <div className="model-status">
                  {loadingState.loading && <div className="loading-spinner" />}
                  {loadingState.loaded && !loadingState.loading && (
                    <div className="loaded-indicator">✓</div>
                  )}
                  {loadingState.error && (
                    <div className="error-indicator" title={loadingState.error}>⚠</div>
                  )}
                </div>
              </div>

              <p className="model-description">{config.description}</p>
              
              <div className="game-use-case">
                <strong>Game Use Case:</strong>
                <p>{config.gameUseCase}</p>
              </div>

              <div className="model-specs">
                <div className="spec-item">
                  <span className="spec-label">Landmarks:</span>
                  <span className="spec-value">{config.landmarks}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Accuracy:</span>
                  <span className="spec-value">{qualityScore}%</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Speed:</span>
                  <span className="spec-value">
                    {performance ? 
                      formatPerformanceMetric(performance.frameRate, 'fps') : 
                      `${config.speed}fps`
                    }
                  </span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Memory:</span>
                  <span className="spec-value">
                    {performance ? 
                      formatPerformanceMetric(performance.memoryUsage, 'MB') : 
                      `${config.memoryRequirement}MB`
                    }
                  </span>
                </div>
              </div>

              {showPerformance && performance && (
                <div className="performance-metrics">
                  <div className="metric">
                    <span>Avg Process Time:</span>
                    <span>{formatPerformanceMetric(performance.averageProcessingTime, 'ms')}</span>
                  </div>
                  <div className="metric">
                    <span>Success Rate:</span>
                    <span>{Math.round((1 - performance.droppedFrames / performance.totalFrames) * 100)}%</span>
                  </div>
                  {performance.gpuAccelerated && (
                    <div className="gpu-indicator">🚀 GPU Accelerated</div>
                  )}
                </div>
              )}

              {isSelected && (
                <div className="model-parameters">
                  <h5>Parameters</h5>
                  <div className="parameter-controls">
                    <div className="parameter-item">
                      <label>Confidence Threshold:</label>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.1"
                        value={processingOptions[landmarkerType].parameters.confidenceThreshold}
                        onChange={(e) => handleParameterChange(
                          landmarkerType, 
                          'parameters.confidenceThreshold', 
                          parseFloat(e.target.value)
                        )}
                      />
                      <span>{processingOptions[landmarkerType].parameters.confidenceThreshold}</span>
                    </div>
                    
                    <div className="parameter-item">
                      <label>Use WebGL:</label>
                      <input
                        type="checkbox"
                        checked={processingOptions[landmarkerType].performanceSettings.useWebGL}
                        onChange={(e) => handleParameterChange(
                          landmarkerType,
                          'performanceSettings.useWebGL',
                          e.target.checked
                        )}
                        disabled={!systemCapabilities?.webglSupported}
                      />
                    </div>

                    <div className="parameter-item">
                      <label>Smoothing Factor:</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={processingOptions[landmarkerType].outputSettings.smoothingFactor}
                        onChange={(e) => handleParameterChange(
                          landmarkerType,
                          'outputSettings.smoothingFactor',
                          parseFloat(e.target.value)
                        )}
                      />
                      <span>{processingOptions[landmarkerType].outputSettings.smoothingFactor}</span>
                    </div>
                  </div>
                </div>
              )}

              {loadingState.error && (
                <div className="error-message">
                  Error: {loadingState.error}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .model-selector {
          padding: 20px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.1);
        }

        .model-selector-header {
          margin-bottom: 24px;
        }

        .model-selector-header h3 {
          margin: 0 0 8px 0;
          color: #1a1a1a;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .description {
          margin: 0;
          color: #666;
          font-size: 0.9rem;
        }

        .system-info {
          margin-bottom: 20px;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .system-status {
          display: flex;
          gap: 16px;
          font-size: 0.85rem;
        }

        .webgl-status.supported {
          color: #28a745;
        }

        .webgl-status.not-supported {
          color: #dc3545;
        }

        .memory-status {
          color: #495057;
        }

        .model-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 16px;
        }

        .model-card {
          position: relative;
          padding: 20px;
          border: 2px solid #e9ecef;
          border-radius: 12px;
          background: white;
          transition: all 0.3s ease;
        }

        .model-card:hover {
          border-color: #007bff;
          box-shadow: 0 4px 12px rgba(0,123,255,0.15);
        }

        .model-card.selected {
          border-color: #007bff;
          background: #f8f9ff;
        }

        .model-card.loading {
          opacity: 0.7;
        }

        .recommendation-badge {
          position: absolute;
          top: -8px;
          right: 12px;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .recommendation-badge.recommended {
          background: #28a745;
          color: white;
        }

        .recommendation-badge.high-memory {
          background: #ffc107;
          color: #212529;
        }

        .model-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .model-header h4 {
          margin: 0;
          color: #1a1a1a;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .model-status {
          display: flex;
          align-items: center;
        }

        .loading-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #f3f3f3;
          border-top: 2px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .loaded-indicator {
          color: #28a745;
          font-weight: bold;
          font-size: 1.1rem;
        }

        .error-indicator {
          color: #dc3545;
          font-weight: bold;
          font-size: 1.1rem;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .model-description {
          margin: 0 0 16px 0;
          color: #666;
          font-size: 0.9rem;
          line-height: 1.4;
        }

        .game-use-case {
          margin-bottom: 16px;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 6px;
        }

        .game-use-case strong {
          display: block;
          margin-bottom: 4px;
          color: #495057;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .game-use-case p {
          margin: 0;
          color: #6c757d;
          font-size: 0.85rem;
        }

        .model-specs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 16px;
        }

        .spec-item {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          border-bottom: 1px solid #f1f3f4;
          font-size: 0.85rem;
        }

        .spec-label {
          color: #666;
        }

        .spec-value {
          color: #1a1a1a;
          font-weight: 500;
        }

        .performance-metrics {
          margin-top: 12px;
          padding: 12px;
          background: #e8f5e8;
          border-radius: 6px;
        }

        .metric {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
          font-size: 0.8rem;
        }

        .gpu-indicator {
          margin-top: 8px;
          font-size: 0.75rem;
          color: #28a745;
          font-weight: 500;
        }

        .model-parameters {
          margin-top: 16px;
          padding: 16px;
          background: #f8f9ff;
          border-radius: 8px;
        }

        .model-parameters h5 {
          margin: 0 0 12px 0;
          color: #495057;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .parameter-controls {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .parameter-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
        }

        .parameter-item label {
          min-width: 120px;
          color: #495057;
        }

        .parameter-item input[type="range"] {
          flex: 1;
        }

        .parameter-item input[type="checkbox"] {
          margin: 0;
        }

        .parameter-item span {
          min-width: 40px;
          text-align: right;
          color: #007bff;
          font-weight: 500;
        }

        .error-message {
          margin-top: 12px;
          padding: 8px 12px;
          background: #f8d7da;
          color: #721c24;
          border-radius: 4px;
          font-size: 0.8rem;
        }
      `}</style>
    </div>
  );
};