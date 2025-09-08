// Results comparison interface for different AI models

import React, { useState, useEffect, useCallback } from 'react';
import {
  LandmarkerType,
  BatchLandmarkerResult,
  ModelComparison,
  LANDMARKER_CONFIGS
} from '../../types/landmarker';

interface ModelComparisonProps {
  videoId: string;
  videoName: string;
  comparisonData: ModelComparison;
  onModelSelect?: (selectedModel: LandmarkerType) => void;
  showDetailedMetrics?: boolean;
  allowExport?: boolean;
}

interface ComparisonMetrics {
  accuracy: number;
  speed: number;
  reliability: number;
  memoryEfficiency: number;
  gameScore: number;
}

interface MetricVisualization {
  name: string;
  color: string;
  value: number;
  max: number;
}

export const ModelComparison: React.FC<ModelComparisonProps> = ({
  videoId,
  videoName,
  comparisonData,
  onModelSelect,
  showDetailedMetrics = true,
  allowExport = true
}) => {
  const [selectedView, setSelectedView] = useState<'overview' | 'detailed' | 'timeline'>('overview');
  const [comparisonMetrics, setComparisonMetrics] = useState<Map<LandmarkerType, ComparisonMetrics>>(new Map());
  const [visualizationData, setVisualizationData] = useState<Map<LandmarkerType, MetricVisualization[]>>(new Map());

  useEffect(() => {
    calculateComparisonMetrics();
    generateVisualizationData();
  }, [comparisonData]);

  const calculateComparisonMetrics = useCallback(() => {
    const metrics = new Map<LandmarkerType, ComparisonMetrics>();

    comparisonData.results.forEach(({ landmarkerType, result }) => {
      const performance = result.performance;
      
      const accuracy = performance.accuracy * 100;
      const speed = Math.min(100, performance.frameRate * 2); // Normalize to 0-100
      const reliability = (1 - performance.droppedFrames / performance.totalFrames) * 100;
      const memoryEfficiency = Math.max(0, 100 - (performance.memoryUsage / 10)); // Inverse of memory usage
      const gameScore = calculateGameDevScore(landmarkerType, result);

      metrics.set(landmarkerType, {
        accuracy,
        speed,
        reliability,
        memoryEfficiency,
        gameScore
      });
    });

    setComparisonMetrics(metrics);
  }, [comparisonData]);

  const generateVisualizationData = useCallback(() => {
    const vizData = new Map<LandmarkerType, MetricVisualization[]>();

    comparisonMetrics.forEach((metrics, landmarkerType) => {
      const visualizations: MetricVisualization[] = [
        { name: 'Accuracy', color: '#28a745', value: metrics.accuracy, max: 100 },
        { name: 'Speed', color: '#007bff', value: metrics.speed, max: 100 },
        { name: 'Reliability', color: '#17a2b8', value: metrics.reliability, max: 100 },
        { name: 'Memory Efficiency', color: '#ffc107', value: metrics.memoryEfficiency, max: 100 },
        { name: 'Game Dev Score', color: '#6f42c1', value: metrics.gameScore, max: 100 }
      ];

      vizData.set(landmarkerType, visualizations);
    });

    setVisualizationData(vizData);
  }, [comparisonMetrics]);

  const calculateGameDevScore = (landmarkerType: LandmarkerType, result: BatchLandmarkerResult): number => {
    const config = LANDMARKER_CONFIGS[landmarkerType];
    const performance = result.performance;
    
    // Weight factors for game development priorities
    const accuracyWeight = 0.35;
    const speedWeight = 0.25;
    const reliabilityWeight = 0.20;
    const usabilityWeight = 0.20;

    const accuracyScore = performance.accuracy * 100;
    const speedScore = Math.min(100, performance.frameRate * 3.33); // 30fps = 100%
    const reliabilityScore = (1 - performance.droppedFrames / performance.totalFrames) * 100;
    const usabilityScore = getUsabilityScore(landmarkerType, config);

    return (
      accuracyScore * accuracyWeight +
      speedScore * speedWeight +
      reliabilityScore * reliabilityWeight +
      usabilityScore * usabilityWeight
    );
  };

  const getUsabilityScore = (landmarkerType: LandmarkerType, config: any): number => {
    // Score based on ease of use for game development
    const usabilityMap: Record<LandmarkerType, number> = {
      pose: 90,      // Most common for character animation
      hand: 85,      // Great for UI and interaction
      face: 80,      // Good for dialogue and emotion
      holistic: 70   // Complex but comprehensive
    };
    
    return usabilityMap[landmarkerType] || 75;
  };

  const getBestPerformer = (metric: keyof ComparisonMetrics): { type: LandmarkerType; value: number } => {
    let bestType: LandmarkerType = 'pose';
    let bestValue = 0;

    comparisonMetrics.forEach((metrics, type) => {
      if (metrics[metric] > bestValue) {
        bestValue = metrics[metric];
        bestType = type;
      }
    });

    return { type: bestType, value: bestValue };
  };

  const getWorstPerformer = (metric: keyof ComparisonMetrics): { type: LandmarkerType; value: number } => {
    let worstType: LandmarkerType = 'pose';
    let worstValue = 100;

    comparisonMetrics.forEach((metrics, type) => {
      if (metrics[metric] < worstValue) {
        worstValue = metrics[metric];
        worstType = type;
      }
    });

    return { type: worstType, value: worstValue };
  };

  const getRecommendationReason = (landmarkerType: LandmarkerType): string => {
    const metrics = comparisonMetrics.get(landmarkerType);
    if (!metrics) return '';

    const reasons = [];

    if (metrics.accuracy > 85) reasons.push('high accuracy');
    if (metrics.speed > 80) reasons.push('excellent performance');
    if (metrics.reliability > 90) reasons.push('very reliable');
    if (metrics.memoryEfficiency > 80) reasons.push('memory efficient');
    if (metrics.gameScore > 85) reasons.push('game-dev optimized');

    return reasons.length > 0 ? reasons.join(', ') : 'balanced performance';
  };

  const exportComparison = (format: 'json' | 'csv') => {
    const data = {
      videoId,
      videoName,
      comparisonDate: new Date().toISOString(),
      results: Array.from(comparisonMetrics.entries()).map(([type, metrics]) => ({
        landmarkerType: type,
        displayName: LANDMARKER_CONFIGS[type].displayName,
        ...metrics,
        recommendation: comparisonData.recommendation.bestForGameUse === type
      })),
      recommendations: comparisonData.recommendation
    };

    let content: string;
    let mimeType: string;
    let filename: string;

    if (format === 'json') {
      content = JSON.stringify(data, null, 2);
      mimeType = 'application/json';
      filename = `model_comparison_${videoId}.json`;
    } else {
      // CSV format
      const headers = ['Model', 'Accuracy', 'Speed', 'Reliability', 'Memory Efficiency', 'Game Score', 'Recommended'];
      const rows = data.results.map(result => [
        result.displayName,
        result.accuracy.toFixed(1),
        result.speed.toFixed(1),
        result.reliability.toFixed(1),
        result.memoryEfficiency.toFixed(1),
        result.gameScore.toFixed(1),
        result.recommendation ? 'Yes' : 'No'
      ]);

      content = [headers, ...rows].map(row => row.join(',')).join('\n');
      mimeType = 'text/csv';
      filename = `model_comparison_${videoId}.csv`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const RadarChart: React.FC<{ landmarkerType: LandmarkerType; metrics: ComparisonMetrics }> = ({ landmarkerType, metrics }) => {
    const center = 60;
    const radius = 50;
    const angles = [0, 72, 144, 216, 288]; // 5 metrics at 72-degree intervals

    const points = Object.values(metrics).map((value, i) => {
      const angle = (angles[i] - 90) * (Math.PI / 180); // Start from top
      const distance = (value / 100) * radius;
      const x = center + distance * Math.cos(angle);
      const y = center + distance * Math.sin(angle);
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="radar-chart">
        <svg width="120" height="120" viewBox="0 0 120 120">
          {/* Background circles */}
          {[20, 40, 60].map(r => (
            <circle
              key={r}
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke="#e9ecef"
              strokeWidth="1"
            />
          ))}
          
          {/* Radar lines */}
          {angles.map(angle => {
            const radian = (angle - 90) * (Math.PI / 180);
            const x = center + radius * Math.cos(radian);
            const y = center + radius * Math.sin(radian);
            return (
              <line
                key={angle}
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                stroke="#e9ecef"
                strokeWidth="1"
              />
            );
          })}
          
          {/* Data polygon */}
          <polygon
            points={points}
            fill={LANDMARKER_CONFIGS[landmarkerType] ? 'rgba(0,123,255,0.3)' : 'rgba(108,117,125,0.3)'}
            stroke="#007bff"
            strokeWidth="2"
          />
          
          {/* Data points */}
          {Object.values(metrics).map((value, i) => {
            const angle = (angles[i] - 90) * (Math.PI / 180);
            const distance = (value / 100) * radius;
            const x = center + distance * Math.cos(angle);
            const y = center + distance * Math.sin(angle);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="3"
                fill="#007bff"
              />
            );
          })}
        </svg>
        
        {/* Labels */}
        <div className="radar-labels">
          {['Accuracy', 'Speed', 'Reliability', 'Memory', 'Game'].map((label, i) => {
            const angle = (angles[i] - 90) * (Math.PI / 180);
            const labelRadius = radius + 15;
            const x = center + labelRadius * Math.cos(angle);
            const y = center + labelRadius * Math.sin(angle);
            
            return (
              <div
                key={label}
                className="radar-label"
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="model-comparison">
      <div className="comparison-header">
        <h3>AI Model Comparison</h3>
        <p className="video-info">Results for: <strong>{videoName}</strong></p>
        
        <div className="view-controls">
          <button
            onClick={() => setSelectedView('overview')}
            className={`view-btn ${selectedView === 'overview' ? 'active' : ''}`}
          >
            Overview
          </button>
          <button
            onClick={() => setSelectedView('detailed')}
            className={`view-btn ${selectedView === 'detailed' ? 'active' : ''}`}
          >
            Detailed
          </button>
          {allowExport && (
            <div className="export-controls">
              <button onClick={() => exportComparison('json')} className="export-btn">
                📄 JSON
              </button>
              <button onClick={() => exportComparison('csv')} className="export-btn">
                📊 CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations Summary */}
      <div className="recommendations-panel">
        <h4>🎯 AI Recommendations</h4>
        <div className="recommendation-grid">
          <div className="recommendation-item best-accuracy">
            <div className="recommendation-icon">🎯</div>
            <div className="recommendation-content">
              <h5>Best Accuracy</h5>
              <p>{LANDMARKER_CONFIGS[comparisonData.recommendation.bestForAccuracy].displayName}</p>
              <span className="metric-value">
                {Math.round(getBestPerformer('accuracy').value)}%
              </span>
            </div>
          </div>
          
          <div className="recommendation-item best-speed">
            <div className="recommendation-icon">⚡</div>
            <div className="recommendation-content">
              <h5>Best Speed</h5>
              <p>{LANDMARKER_CONFIGS[comparisonData.recommendation.bestForSpeed].displayName}</p>
              <span className="metric-value">
                {Math.round(getBestPerformer('speed').value)} score
              </span>
            </div>
          </div>
          
          <div className="recommendation-item best-game">
            <div className="recommendation-icon">🎮</div>
            <div className="recommendation-content">
              <h5>Best for Games</h5>
              <p>{LANDMARKER_CONFIGS[comparisonData.recommendation.bestForGameUse].displayName}</p>
              <span className="reason">
                {getRecommendationReason(comparisonData.recommendation.bestForGameUse)}
              </span>
            </div>
          </div>
        </div>
        
        <div className="reasoning">
          <p><strong>Analysis:</strong> {comparisonData.recommendation.reasoning}</p>
        </div>
      </div>

      {/* Overview Tab */}
      {selectedView === 'overview' && (
        <div className="overview-section">
          <div className="models-grid">
            {comparisonData.results.map(({ landmarkerType, result, score }) => {
              const metrics = comparisonMetrics.get(landmarkerType);
              const config = LANDMARKER_CONFIGS[landmarkerType];
              const isRecommended = comparisonData.recommendation.bestForGameUse === landmarkerType;

              return (
                <div 
                  key={landmarkerType}
                  className={`model-overview-card ${isRecommended ? 'recommended' : ''}`}
                  onClick={() => onModelSelect?.(landmarkerType)}
                  style={{ cursor: onModelSelect ? 'pointer' : 'default' }}
                >
                  {isRecommended && <div className="recommended-badge">Recommended</div>}
                  
                  <div className="card-header">
                    <h4>{config.displayName}</h4>
                    <div className="overall-score">
                      {Math.round(score)}
                    </div>
                  </div>

                  <div className="model-specs">
                    <span>{config.landmarks} landmarks</span>
                    <span>{config.gameUseCase}</span>
                  </div>

                  {metrics && (
                    <div className="performance-bars">
                      <div className="perf-bar">
                        <span className="bar-label">Accuracy</span>
                        <div className="bar">
                          <div 
                            className="bar-fill accuracy"
                            style={{ width: `${metrics.accuracy}%` }}
                          />
                        </div>
                        <span className="bar-value">{Math.round(metrics.accuracy)}%</span>
                      </div>

                      <div className="perf-bar">
                        <span className="bar-label">Speed</span>
                        <div className="bar">
                          <div 
                            className="bar-fill speed"
                            style={{ width: `${metrics.speed}%` }}
                          />
                        </div>
                        <span className="bar-value">{Math.round(metrics.speed)}</span>
                      </div>

                      <div className="perf-bar">
                        <span className="bar-label">Game Score</span>
                        <div className="bar">
                          <div 
                            className="bar-fill game-score"
                            style={{ width: `${metrics.gameScore}%` }}
                          />
                        </div>
                        <span className="bar-value">{Math.round(metrics.gameScore)}</span>
                      </div>
                    </div>
                  )}

                  <div className="performance-summary">
                    <div className="summary-item">
                      <span>FPS:</span>
                      <span>{Math.round(result.performance.frameRate)}</span>
                    </div>
                    <div className="summary-item">
                      <span>Frames:</span>
                      <span>{result.results.length}</span>
                    </div>
                    <div className="summary-item">
                      <span>Dropped:</span>
                      <span>{result.performance.droppedFrames}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detailed Tab */}
      {selectedView === 'detailed' && showDetailedMetrics && (
        <div className="detailed-section">
          <div className="detailed-grid">
            {comparisonData.results.map(({ landmarkerType, result }) => {
              const metrics = comparisonMetrics.get(landmarkerType);
              const config = LANDMARKER_CONFIGS[landmarkerType];

              return (
                <div key={landmarkerType} className="detailed-model-card">
                  <div className="detailed-header">
                    <h4>{config.displayName}</h4>
                    {metrics && (
                      <RadarChart landmarkerType={landmarkerType} metrics={metrics} />
                    )}
                  </div>

                  <div className="detailed-metrics">
                    <div className="metric-group">
                      <h5>Performance Metrics</h5>
                      <div className="metric-rows">
                        <div className="metric-row">
                          <span>Processing Time (avg):</span>
                          <span>{Math.round(result.performance.averageProcessingTime)}ms</span>
                        </div>
                        <div className="metric-row">
                          <span>Frame Rate:</span>
                          <span>{Math.round(result.performance.frameRate)} fps</span>
                        </div>
                        <div className="metric-row">
                          <span>Accuracy:</span>
                          <span>{Math.round(result.performance.accuracy * 100)}%</span>
                        </div>
                        <div className="metric-row">
                          <span>Memory Usage:</span>
                          <span>{Math.round(result.performance.memoryUsage)} MB</span>
                        </div>
                      </div>
                    </div>

                    <div className="metric-group">
                      <h5>Reliability</h5>
                      <div className="metric-rows">
                        <div className="metric-row">
                          <span>Total Frames:</span>
                          <span>{result.performance.totalFrames}</span>
                        </div>
                        <div className="metric-row">
                          <span>Dropped Frames:</span>
                          <span>{result.performance.droppedFrames}</span>
                        </div>
                        <div className="metric-row">
                          <span>Success Rate:</span>
                          <span>{Math.round((1 - result.performance.droppedFrames / result.performance.totalFrames) * 100)}%</span>
                        </div>
                        <div className="metric-row">
                          <span>GPU Accelerated:</span>
                          <span>{result.performance.gpuAccelerated ? '✅' : '❌'}</span>
                        </div>
                      </div>
                    </div>

                    {metrics && (
                      <div className="metric-group">
                        <h5>Game Development Scores</h5>
                        <div className="metric-rows">
                          <div className="metric-row">
                            <span>Overall Game Score:</span>
                            <span className="game-score-value">{Math.round(metrics.gameScore)}/100</span>
                          </div>
                          <div className="metric-row">
                            <span>Memory Efficiency:</span>
                            <span>{Math.round(metrics.memoryEfficiency)}%</span>
                          </div>
                          <div className="metric-row">
                            <span>Reliability Score:</span>
                            <span>{Math.round(metrics.reliability)}%</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style jsx>{`
        .model-comparison {
          padding: 24px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.1);
        }

        .comparison-header {
          margin-bottom: 24px;
        }

        .comparison-header h3 {
          margin: 0 0 8px 0;
          color: #1a1a1a;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .video-info {
          margin: 0 0 16px 0;
          color: #666;
          font-size: 0.9rem;
        }

        .view-controls {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .view-btn {
          padding: 8px 16px;
          border: 1px solid #dee2e6;
          background: white;
          color: #495057;
          border-radius: 6px;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .view-btn.active {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }

        .view-btn:hover:not(.active) {
          background: #f8f9fa;
          border-color: #adb5bd;
        }

        .export-controls {
          display: flex;
          gap: 4px;
          margin-left: auto;
        }

        .export-btn {
          padding: 6px 12px;
          border: 1px solid #6c757d;
          background: white;
          color: #6c757d;
          border-radius: 4px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .export-btn:hover {
          background: #6c757d;
          color: white;
        }

        .recommendations-panel {
          margin-bottom: 24px;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 8px;
          color: white;
        }

        .recommendations-panel h4 {
          margin: 0 0 16px 0;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .recommendation-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }

        .recommendation-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          backdrop-filter: blur(10px);
        }

        .recommendation-icon {
          font-size: 1.5rem;
          min-width: 32px;
          text-align: center;
        }

        .recommendation-content h5 {
          margin: 0 0 4px 0;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .recommendation-content p {
          margin: 0 0 4px 0;
          font-size: 0.85rem;
          opacity: 0.9;
        }

        .metric-value {
          font-size: 0.8rem;
          font-weight: 500;
          opacity: 0.8;
        }

        .reason {
          font-size: 0.7rem;
          opacity: 0.7;
          font-style: italic;
        }

        .reasoning {
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.2);
        }

        .reasoning p {
          margin: 0;
          font-size: 0.9rem;
          opacity: 0.9;
        }

        .models-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }

        .model-overview-card {
          position: relative;
          padding: 20px;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          background: white;
          transition: all 0.3s ease;
        }

        .model-overview-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          transform: translateY(-2px);
        }

        .model-overview-card.recommended {
          border-color: #28a745;
          box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.2);
        }

        .recommended-badge {
          position: absolute;
          top: -8px;
          right: 16px;
          padding: 4px 8px;
          background: #28a745;
          color: white;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .card-header h4 {
          margin: 0;
          color: #1a1a1a;
          font-size: 1rem;
          font-weight: 600;
        }

        .overall-score {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #007bff;
          color: white;
          border-radius: 50%;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .model-specs {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 16px;
          font-size: 0.85rem;
          color: #6c757d;
        }

        .performance-bars {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }

        .perf-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
        }

        .bar-label {
          min-width: 60px;
          color: #495057;
        }

        .bar {
          flex: 1;
          height: 6px;
          background: #e9ecef;
          border-radius: 3px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .bar-fill.accuracy { background: #28a745; }
        .bar-fill.speed { background: #007bff; }
        .bar-fill.game-score { background: #6f42c1; }

        .bar-value {
          min-width: 35px;
          text-align: right;
          color: #495057;
          font-weight: 500;
        }

        .performance-summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          font-size: 0.8rem;
        }

        .summary-item {
          display: flex;
          justify-content: space-between;
          color: #6c757d;
        }

        .detailed-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 24px;
        }

        .detailed-model-card {
          padding: 20px;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          background: #f8f9fa;
        }

        .detailed-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
        }

        .detailed-header h4 {
          margin: 0;
          color: #1a1a1a;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .radar-chart {
          position: relative;
          width: 120px;
          height: 120px;
        }

        .radar-labels {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .radar-label {
          position: absolute;
          font-size: 0.7rem;
          color: #495057;
          font-weight: 500;
          white-space: nowrap;
        }

        .detailed-metrics {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .metric-group h5 {
          margin: 0 0 12px 0;
          color: #495057;
          font-size: 0.9rem;
          font-weight: 600;
          padding-bottom: 6px;
          border-bottom: 1px solid #dee2e6;
        }

        .metric-rows {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .metric-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
        }

        .metric-row span:first-child {
          color: #6c757d;
        }

        .metric-row span:last-child {
          color: #495057;
          font-weight: 500;
        }

        .game-score-value {
          color: #6f42c1 !important;
          font-weight: 600 !important;
        }

        @media (max-width: 768px) {
          .view-controls {
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
          }

          .export-controls {
            margin-left: 0;
            justify-content: stretch;
          }

          .export-btn {
            flex: 1;
          }

          .recommendation-grid {
            grid-template-columns: 1fr;
          }

          .models-grid {
            grid-template-columns: 1fr;
          }

          .detailed-grid {
            grid-template-columns: 1fr;
          }

          .detailed-header {
            flex-direction: column;
            align-items: center;
            gap: 16px;
          }
        }
      `}</style>
    </div>
  );
};