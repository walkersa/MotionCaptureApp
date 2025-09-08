// Performance metrics tracking and display system

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LandmarkerType,
  LandmarkerPerformance,
  LANDMARKER_CONFIGS
} from '../../types/landmarker';
import { useLandmarkerProcessor } from '../../utils/landmarkerProcessor';
import { useModelManager } from '../../utils/modelManager';

interface PerformanceMetricsProps {
  showRealTimeMetrics?: boolean;
  showHistoricalData?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage?: number;
  frameDrops: number;
  thermalState: 'normal' | 'fair' | 'serious' | 'critical';
}

interface PerformanceHistory {
  timestamp: number;
  landmarkerType: LandmarkerType;
  metrics: LandmarkerPerformance;
  systemMetrics: SystemMetrics;
}

export const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({
  showRealTimeMetrics = true,
  showHistoricalData = true,
  autoRefresh = true,
  refreshInterval = 1000
}) => {
  const { getAllPerformanceMetrics } = useLandmarkerProcessor();
  const { getSystemCapabilities } = useModelManager();
  
  const [currentMetrics, setCurrentMetrics] = useState<Map<LandmarkerType, LandmarkerPerformance>>(new Map());
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>({
    cpuUsage: 0,
    memoryUsage: 0,
    frameDrops: 0,
    thermalState: 'normal'
  });
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceHistory[]>([]);
  const [systemCapabilities, setSystemCapabilities] = useState<any>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const performanceObserverRef = useRef<PerformanceObserver | null>(null);

  useEffect(() => {
    loadSystemCapabilities();
    
    if (autoRefresh) {
      startMonitoring();
    }
    
    return () => {
      stopMonitoring();
    };
  }, [autoRefresh, refreshInterval]);

  const loadSystemCapabilities = useCallback(async () => {
    try {
      const capabilities = await getSystemCapabilities();
      setSystemCapabilities(capabilities);
    } catch (error) {
      console.error('Failed to load system capabilities:', error);
    }
  }, [getSystemCapabilities]);

  const startMonitoring = useCallback(() => {
    if (isMonitoring) return;
    
    setIsMonitoring(true);
    
    // Start performance observer for frame timing
    if ('PerformanceObserver' in window) {
      performanceObserverRef.current = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        // Process performance entries for frame drops and timing
        this.processPerformanceEntries(entries);
      });
      
      try {
        performanceObserverRef.current.observe({ entryTypes: ['measure', 'navigation'] });
      } catch (error) {
        console.warn('Performance observer not fully supported:', error);
      }
    }
    
    // Start regular metrics collection
    refreshIntervalRef.current = setInterval(() => {
      collectMetrics();
    }, refreshInterval);
    
    // Initial collection
    collectMetrics();
  }, [isMonitoring, refreshInterval]);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
    
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    
    if (performanceObserverRef.current) {
      performanceObserverRef.current.disconnect();
      performanceObserverRef.current = null;
    }
  }, []);

  const collectMetrics = useCallback(async () => {
    try {
      // Get landmarker performance metrics
      const landmarkerMetrics = getAllPerformanceMetrics();
      setCurrentMetrics(landmarkerMetrics);
      
      // Get system metrics
      const systemStats = await collectSystemMetrics();
      setSystemMetrics(systemStats);
      
      // Add to history
      const timestamp = Date.now();
      const historyEntries: PerformanceHistory[] = [];
      
      landmarkerMetrics.forEach((metrics, landmarkerType) => {
        historyEntries.push({
          timestamp,
          landmarkerType,
          metrics,
          systemMetrics: systemStats
        });
      });
      
      setPerformanceHistory(prev => {
        const updated = [...prev, ...historyEntries];
        // Keep only last 100 entries per landmarker type
        const limited = updated.slice(-400); // 4 landmarkers * 100 entries
        return limited;
      });
      
    } catch (error) {
      console.error('Failed to collect metrics:', error);
    }
  }, [getAllPerformanceMetrics]);

  const collectSystemMetrics = async (): Promise<SystemMetrics> => {
    const metrics: SystemMetrics = {
      cpuUsage: 0,
      memoryUsage: 0,
      frameDrops: 0,
      thermalState: 'normal'
    };

    // Memory usage
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      metrics.memoryUsage = (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100;
    }

    // CPU usage estimation (simplified)
    metrics.cpuUsage = await this.estimateCPUUsage();
    
    // Thermal state (if available on device)
    if ('deviceMemory' in navigator && 'hardwareConcurrency' in navigator) {
      const deviceMemory = (navigator as any).deviceMemory || 4;
      const cores = navigator.hardwareConcurrency || 4;
      
      // Simple heuristic for thermal state
      if (metrics.cpuUsage > 80 || metrics.memoryUsage > 90) {
        metrics.thermalState = 'critical';
      } else if (metrics.cpuUsage > 60 || metrics.memoryUsage > 70) {
        metrics.thermalState = 'serious';
      } else if (metrics.cpuUsage > 40 || metrics.memoryUsage > 50) {
        metrics.thermalState = 'fair';
      }
    }

    return metrics;
  };

  private estimateCPUUsage = async (): Promise<number> => {
    return new Promise(resolve => {
      const start = performance.now();
      const iterations = 100000;
      
      // Perform CPU-intensive task
      for (let i = 0; i < iterations; i++) {
        Math.random() * Math.random();
      }
      
      const duration = performance.now() - start;
      
      // Normalize to percentage (simplified estimation)
      const baselineTime = 10; // Expected time for this operation in ms
      const usage = Math.min(100, (duration / baselineTime) * 20);
      
      resolve(usage);
    });
  };

  private processPerformanceEntries = (entries: PerformanceEntry[]) => {
    // Process performance entries to detect frame drops
    entries.forEach(entry => {
      if (entry.entryType === 'measure' && entry.name.includes('frame')) {
        // Detect long frame times as potential drops
        if (entry.duration > 33.33) { // Longer than 30fps frame time
          setSystemMetrics(prev => ({
            ...prev,
            frameDrops: prev.frameDrops + 1
          }));
        }
      }
    });
  };

  const getPerformanceColor = (value: number, type: 'fps' | 'accuracy' | 'memory'): string => {
    switch (type) {
      case 'fps':
        if (value >= 25) return '#28a745';
        if (value >= 15) return '#ffc107';
        return '#dc3545';
      case 'accuracy':
        if (value >= 0.8) return '#28a745';
        if (value >= 0.6) return '#ffc107';
        return '#dc3545';
      case 'memory':
        if (value <= 50) return '#28a745';
        if (value <= 80) return '#ffc107';
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  const getThermalStateColor = (state: SystemMetrics['thermalState']): string => {
    switch (state) {
      case 'normal': return '#28a745';
      case 'fair': return '#17a2b8';
      case 'serious': return '#ffc107';
      case 'critical': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const calculateAverageMetrics = (landmarkerType: LandmarkerType): { avgFps: number; avgAccuracy: number; avgMemory: number } => {
    const typeHistory = performanceHistory.filter(h => h.landmarkerType === landmarkerType);
    
    if (typeHistory.length === 0) {
      return { avgFps: 0, avgAccuracy: 0, avgMemory: 0 };
    }
    
    const recentHistory = typeHistory.slice(-20); // Last 20 entries
    
    return {
      avgFps: recentHistory.reduce((sum, h) => sum + h.metrics.frameRate, 0) / recentHistory.length,
      avgAccuracy: recentHistory.reduce((sum, h) => sum + h.metrics.accuracy, 0) / recentHistory.length,
      avgMemory: recentHistory.reduce((sum, h) => sum + h.metrics.memoryUsage, 0) / recentHistory.length
    };
  };

  return (
    <div className="performance-metrics">
      <div className="metrics-header">
        <h3>Performance Metrics</h3>
        <div className="metrics-controls">
          <button
            onClick={isMonitoring ? stopMonitoring : startMonitoring}
            className={`monitor-toggle ${isMonitoring ? 'active' : ''}`}
          >
            {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
          </button>
          <button
            onClick={() => setPerformanceHistory([])}
            className="clear-history"
            disabled={performanceHistory.length === 0}
          >
            Clear History
          </button>
        </div>
      </div>

      {/* System Overview */}
      <div className="system-overview">
        <h4>System Status</h4>
        <div className="system-grid">
          <div className="system-metric">
            <span className="metric-label">CPU Usage</span>
            <div className="metric-bar">
              <div 
                className="metric-fill"
                style={{ 
                  width: `${systemMetrics.cpuUsage}%`,
                  backgroundColor: getPerformanceColor(systemMetrics.cpuUsage, 'memory')
                }}
              />
            </div>
            <span className="metric-value">{Math.round(systemMetrics.cpuUsage)}%</span>
          </div>

          <div className="system-metric">
            <span className="metric-label">Memory Usage</span>
            <div className="metric-bar">
              <div 
                className="metric-fill"
                style={{ 
                  width: `${systemMetrics.memoryUsage}%`,
                  backgroundColor: getPerformanceColor(systemMetrics.memoryUsage, 'memory')
                }}
              />
            </div>
            <span className="metric-value">{Math.round(systemMetrics.memoryUsage)}%</span>
          </div>

          <div className="system-metric">
            <span className="metric-label">Thermal State</span>
            <div 
              className="thermal-indicator"
              style={{ backgroundColor: getThermalStateColor(systemMetrics.thermalState) }}
            >
              {systemMetrics.thermalState.toUpperCase()}
            </div>
          </div>

          <div className="system-metric">
            <span className="metric-label">Frame Drops</span>
            <span className="metric-value large">{systemMetrics.frameDrops}</span>
          </div>
        </div>

        {systemCapabilities && (
          <div className="capabilities-info">
            <span className="capability-item">
              WebGL: {systemCapabilities.webglSupported ? '✅' : '❌'}
            </span>
            <span className="capability-item">
              Available Memory: {Math.round(systemCapabilities.memoryStatus.usage.available / (1024 * 1024))}MB
            </span>
            <span className="capability-item">
              Max Concurrent: {systemCapabilities.estimatedMaxConcurrentLandmarkers}
            </span>
          </div>
        )}
      </div>

      {/* Landmarker Performance */}
      {showRealTimeMetrics && (
        <div className="landmarker-metrics">
          <h4>Landmarker Performance</h4>
          <div className="metrics-grid">
            {Array.from(currentMetrics.entries()).map(([landmarkerType, metrics]) => {
              const config = LANDMARKER_CONFIGS[landmarkerType];
              const averages = calculateAverageMetrics(landmarkerType);
              
              return (
                <div key={landmarkerType} className="landmarker-metric-card">
                  <div className="card-header">
                    <h5>{config.displayName}</h5>
                    <span className="landmark-count">{config.landmarks} landmarks</span>
                  </div>

                  <div className="performance-stats">
                    <div className="stat-row">
                      <span className="stat-label">FPS</span>
                      <div className="stat-values">
                        <span 
                          className="current-value"
                          style={{ color: getPerformanceColor(metrics.frameRate, 'fps') }}
                        >
                          {Math.round(metrics.frameRate)}
                        </span>
                        <span className="avg-value">avg: {Math.round(averages.avgFps)}</span>
                      </div>
                    </div>

                    <div className="stat-row">
                      <span className="stat-label">Accuracy</span>
                      <div className="stat-values">
                        <span 
                          className="current-value"
                          style={{ color: getPerformanceColor(metrics.accuracy, 'accuracy') }}
                        >
                          {Math.round(metrics.accuracy * 100)}%
                        </span>
                        <span className="avg-value">avg: {Math.round(averages.avgAccuracy * 100)}%</span>
                      </div>
                    </div>

                    <div className="stat-row">
                      <span className="stat-label">Avg Process Time</span>
                      <span className="current-value">
                        {Math.round(metrics.averageProcessingTime)}ms
                      </span>
                    </div>

                    <div className="stat-row">
                      <span className="stat-label">Memory Usage</span>
                      <div className="stat-values">
                        <span 
                          className="current-value"
                          style={{ color: getPerformanceColor(metrics.memoryUsage, 'memory') }}
                        >
                          {Math.round(metrics.memoryUsage)}MB
                        </span>
                        <span className="avg-value">avg: {Math.round(averages.avgMemory)}MB</span>
                      </div>
                    </div>

                    <div className="stat-row">
                      <span className="stat-label">Success Rate</span>
                      <span className="current-value">
                        {Math.round((1 - metrics.droppedFrames / metrics.totalFrames) * 100)}%
                      </span>
                    </div>

                    {metrics.gpuAccelerated && (
                      <div className="gpu-indicator">
                        🚀 GPU Accelerated
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Historical Performance Chart */}
      {showHistoricalData && performanceHistory.length > 0 && (
        <div className="performance-history">
          <h4>Performance History</h4>
          <div className="history-chart">
            {/* Simplified chart - in production you might use a charting library */}
            <div className="chart-legend">
              {Object.keys(LANDMARKER_CONFIGS).map(type => (
                <div key={type} className="legend-item">
                  <div 
                    className="legend-color"
                    style={{ backgroundColor: this.getLandmarkerColor(type as LandmarkerType) }}
                  />
                  <span>{LANDMARKER_CONFIGS[type as LandmarkerType].displayName}</span>
                </div>
              ))}
            </div>
            
            <div className="chart-container">
              <div className="chart-note">
                📊 Detailed performance charts available in full production version
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .performance-metrics {
          padding: 24px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.1);
        }

        .metrics-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .metrics-header h3 {
          margin: 0;
          color: #1a1a1a;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .metrics-controls {
          display: flex;
          gap: 8px;
        }

        .monitor-toggle {
          padding: 8px 16px;
          border: 1px solid #007bff;
          border-radius: 6px;
          background: white;
          color: #007bff;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .monitor-toggle.active {
          background: #007bff;
          color: white;
        }

        .monitor-toggle:hover {
          background: #0056b3;
          color: white;
          border-color: #0056b3;
        }

        .clear-history {
          padding: 8px 16px;
          border: 1px solid #6c757d;
          border-radius: 6px;
          background: white;
          color: #6c757d;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .clear-history:hover:not(:disabled) {
          background: #6c757d;
          color: white;
        }

        .clear-history:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .system-overview {
          margin-bottom: 24px;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .system-overview h4 {
          margin: 0 0 16px 0;
          color: #495057;
          font-size: 1rem;
          font-weight: 600;
        }

        .system-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }

        .system-metric {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .metric-label {
          font-size: 0.85rem;
          color: #6c757d;
          font-weight: 500;
        }

        .metric-bar {
          width: 100%;
          height: 8px;
          background: #e9ecef;
          border-radius: 4px;
          overflow: hidden;
        }

        .metric-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .metric-value {
          font-size: 0.9rem;
          font-weight: 600;
          color: #495057;
        }

        .metric-value.large {
          font-size: 1.1rem;
        }

        .thermal-indicator {
          padding: 4px 8px;
          border-radius: 4px;
          color: white;
          font-size: 0.8rem;
          font-weight: 600;
          text-align: center;
        }

        .capabilities-info {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          padding: 12px;
          background: white;
          border-radius: 6px;
          border-left: 4px solid #007bff;
        }

        .capability-item {
          font-size: 0.85rem;
          color: #495057;
        }

        .landmarker-metrics h4 {
          margin: 0 0 16px 0;
          color: #495057;
          font-size: 1rem;
          font-weight: 600;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }

        .landmarker-metric-card {
          padding: 16px;
          background: #f8f9fa;
          border-radius: 8px;
          border-left: 4px solid #007bff;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .card-header h5 {
          margin: 0;
          color: #1a1a1a;
          font-size: 1rem;
          font-weight: 600;
        }

        .landmark-count {
          font-size: 0.75rem;
          color: #6c757d;
          background: #e9ecef;
          padding: 2px 6px;
          border-radius: 3px;
        }

        .performance-stats {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .stat-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .stat-label {
          font-size: 0.85rem;
          color: #6c757d;
          font-weight: 500;
        }

        .stat-values {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .current-value {
          font-size: 0.9rem;
          font-weight: 600;
        }

        .avg-value {
          font-size: 0.75rem;
          color: #6c757d;
          font-style: italic;
        }

        .gpu-indicator {
          margin-top: 8px;
          font-size: 0.75rem;
          color: #28a745;
          font-weight: 500;
          text-align: center;
        }

        .performance-history {
          margin-top: 24px;
        }

        .performance-history h4 {
          margin: 0 0 16px 0;
          color: #495057;
          font-size: 1rem;
          font-weight: 600;
        }

        .history-chart {
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .chart-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 16px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
          color: #495057;
        }

        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
        }

        .chart-container {
          height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px dashed #dee2e6;
          border-radius: 6px;
        }

        .chart-note {
          color: #6c757d;
          font-style: italic;
        }

        @media (max-width: 768px) {
          .metrics-header {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }

          .metrics-controls {
            justify-content: stretch;
          }

          .monitor-toggle,
          .clear-history {
            flex: 1;
          }

          .system-grid {
            grid-template-columns: 1fr;
          }

          .capabilities-info {
            flex-direction: column;
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );

  private getLandmarkerColor = (type: LandmarkerType): string => {
    const colors = {
      pose: '#007bff',
      hand: '#28a745', 
      face: '#dc3545',
      holistic: '#6f42c1'
    };
    return colors[type];
  };
};