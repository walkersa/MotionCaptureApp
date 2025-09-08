// Memory management utilities for video processing

export interface MemoryUsage {
  used: number;
  total: number;
  available: number;
  percentage: number;
}

export interface ProcessingLimits {
  maxFileSize: number;
  maxConcurrentProcessing: number;
  maxFrameCount: number;
  recommendedChunkSize: number;
}

export class MemoryManager {
  private static instance: MemoryManager;
  private processingQueue: Set<string> = new Set();
  private memoryWarningThreshold = 0.8; // 80% memory usage warning
  private memoryLimitThreshold = 0.9; // 90% memory usage limit

  private constructor() {
    this.setupMemoryMonitoring();
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  private setupMemoryMonitoring() {
    // Monitor memory every 30 seconds
    setInterval(() => {
      this.checkMemoryUsage();
    }, 30000);

    // Monitor when processing starts/stops
    this.monitorProcessingQueue();
  }

  async getMemoryUsage(): Promise<MemoryUsage> {
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      return {
        used: memInfo.usedJSHeapSize,
        total: memInfo.totalJSHeapSize,
        available: memInfo.jsHeapSizeLimit - memInfo.usedJSHeapSize,
        percentage: memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit
      };
    }

    // Fallback estimation
    return {
      used: 0,
      total: 0,
      available: Infinity,
      percentage: 0
    };
  }

  calculateProcessingLimits(availableMemory: number): ProcessingLimits {
    // Conservative estimates based on available memory
    const safeMemory = Math.floor(availableMemory * 0.6); // Use 60% of available memory
    
    return {
      maxFileSize: Math.min(100 * 1024 * 1024, safeMemory / 4), // 100MB or 1/4 of safe memory
      maxConcurrentProcessing: safeMemory > 500 * 1024 * 1024 ? 3 : 1, // 3 if > 500MB, else 1
      maxFrameCount: Math.floor(safeMemory / (512 * 512 * 4)), // Estimate based on 512x512 RGBA frames
      recommendedChunkSize: Math.max(10 * 1024 * 1024, safeMemory / 20) // 10MB or 1/20 of safe memory
    };
  }

  async canProcessFile(fileSize: number, processingType: 'single' | 'batch' = 'single'): Promise<{
    canProcess: boolean;
    reason?: string;
    suggestions?: string[];
  }> {
    const memoryUsage = await this.getMemoryUsage();
    const limits = this.calculateProcessingLimits(memoryUsage.available);
    
    // Check file size limit
    if (fileSize > limits.maxFileSize) {
      return {
        canProcess: false,
        reason: 'File too large for available memory',
        suggestions: [
          `Reduce file size to under ${Math.round(limits.maxFileSize / (1024 * 1024))}MB`,
          'Close other browser tabs to free memory',
          'Process smaller video clips'
        ]
      };
    }
    
    // Check concurrent processing limit
    if (processingType === 'batch' && this.processingQueue.size >= limits.maxConcurrentProcessing) {
      return {
        canProcess: false,
        reason: 'Too many videos processing simultaneously',
        suggestions: [
          'Wait for current processing to complete',
          'Process videos one at a time',
          'Increase available memory by closing other applications'
        ]
      };
    }
    
    // Check overall memory pressure
    if (memoryUsage.percentage > this.memoryLimitThreshold) {
      return {
        canProcess: false,
        reason: 'System memory usage too high',
        suggestions: [
          'Close other browser tabs',
          'Restart the browser',
          'Process smaller files'
        ]
      };
    }
    
    return { canProcess: true };
  }

  startProcessing(processId: string): boolean {
    if (this.processingQueue.size >= 3) { // Hard limit
      return false;
    }
    
    this.processingQueue.add(processId);
    console.log(`Started processing ${processId}. Active: ${this.processingQueue.size}`);
    return true;
  }

  stopProcessing(processId: string): void {
    this.processingQueue.delete(processId);
    console.log(`Stopped processing ${processId}. Active: ${this.processingQueue.size}`);
    
    // Force garbage collection if available
    this.requestGarbageCollection();
  }

  private async checkMemoryUsage() {
    const usage = await this.getMemoryUsage();
    
    if (usage.percentage > this.memoryWarningThreshold) {
      console.warn(`High memory usage detected: ${Math.round(usage.percentage * 100)}%`);
      
      if (usage.percentage > this.memoryLimitThreshold) {
        console.error('Memory usage critical - stopping non-essential processing');
        this.handleMemoryPressure();
      }
    }
  }

  private handleMemoryPressure() {
    // Clear any cached data
    this.clearProcessingCache();
    
    // Request garbage collection
    this.requestGarbageCollection();
    
    // Emit memory pressure event for components to handle
    window.dispatchEvent(new CustomEvent('memory-pressure', {
      detail: { action: 'reduce-usage' }
    }));
  }

  private clearProcessingCache() {
    // Clear any processing caches
    // This would be implemented based on your caching strategy
    console.log('Clearing processing caches due to memory pressure');
  }

  private requestGarbageCollection() {
    // Request garbage collection if available (Chrome dev tools)
    if (window.gc && typeof window.gc === 'function') {
      window.gc();
    }
    
    // Alternative method for forcing GC in some browsers
    if ('FinalizationRegistry' in window) {
      // Create a temporary large object to trigger GC
      const temp = new ArrayBuffer(1024 * 1024); // 1MB
      setTimeout(() => {
        // Let it be garbage collected
        (temp as any).length = 0;
      }, 0);
    }
  }

  private monitorProcessingQueue() {
    setInterval(() => {
      if (this.processingQueue.size > 0) {
        console.log(`Active processing jobs: ${Array.from(this.processingQueue).join(', ')}`);
      }
    }, 60000); // Every minute
  }

  // Utility for chunked processing
  async processInChunks<T>(
    items: T[],
    processor: (chunk: T[]) => Promise<void>,
    chunkSize?: number
  ): Promise<void> {
    const memoryUsage = await this.getMemoryUsage();
    const limits = this.calculateProcessingLimits(memoryUsage.available);
    const actualChunkSize = chunkSize || Math.max(1, Math.floor(items.length / 3));
    
    for (let i = 0; i < items.length; i += actualChunkSize) {
      const chunk = items.slice(i, i + actualChunkSize);
      
      // Check memory before each chunk
      const canContinue = await this.canProcessFile(0, 'single');
      if (!canContinue.canProcess) {
        throw new Error(`Memory pressure too high: ${canContinue.reason}`);
      }
      
      await processor(chunk);
      
      // Small delay to allow GC
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // File size optimization suggestions
  getOptimizationSuggestions(fileSize: number, duration: number): string[] {
    const suggestions: string[] = [];
    
    if (fileSize > 50 * 1024 * 1024) { // > 50MB
      suggestions.push('Consider reducing video resolution to 720p or lower');
    }
    
    if (duration > 10) {
      suggestions.push('Trim video to 10 seconds or less for better performance');
    }
    
    const bitrate = (fileSize * 8) / duration; // bits per second
    if (bitrate > 10 * 1024 * 1024) { // > 10Mbps
      suggestions.push('Reduce video bitrate for smaller file size');
    }
    
    suggestions.push('Convert to MP4 with H.264 codec for best compatibility');
    
    return suggestions;
  }

  // Memory-aware video processing options
  getRecommendedProcessingOptions(fileSize: number): {
    fps: number;
    maxWidth: number;
    maxHeight: number;
    quality: number;
  } {
    // Adjust processing parameters based on file size and available memory
    if (fileSize > 50 * 1024 * 1024) { // Large file
      return {
        fps: 15,
        maxWidth: 720,
        maxHeight: 720,
        quality: 60
      };
    } else if (fileSize > 20 * 1024 * 1024) { // Medium file
      return {
        fps: 24,
        maxWidth: 1080,
        maxHeight: 1080,
        quality: 75
      };
    } else { // Small file
      return {
        fps: 30,
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 85
      };
    }
  }

  // Create memory usage monitor component data
  async getMemoryStats() {
    const usage = await this.getMemoryUsage();
    const limits = this.calculateProcessingLimits(usage.available);
    
    return {
      usage,
      limits,
      activeProcesses: this.processingQueue.size,
      status: usage.percentage > this.memoryLimitThreshold ? 'critical' :
              usage.percentage > this.memoryWarningThreshold ? 'warning' : 'normal'
    };
  }
}

// Global memory manager instance
export const memoryManager = MemoryManager.getInstance();

// React hook for memory management
export function useMemoryManager() {
  return {
    memoryManager,
    canProcessFile: memoryManager.canProcessFile.bind(memoryManager),
    startProcessing: memoryManager.startProcessing.bind(memoryManager),
    stopProcessing: memoryManager.stopProcessing.bind(memoryManager),
    getMemoryStats: memoryManager.getMemoryStats.bind(memoryManager)
  };
}