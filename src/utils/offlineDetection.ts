// Enhanced offline detection with custom connectivity checks
export class OfflineDetectionService {
  private listeners: Set<(isOnline: boolean) => void> = new Set();
  private isOnlineState = navigator.onLine;
  private checkInterval: number | null = null;
  
  constructor() {
    this.setupEventListeners();
    this.startPeriodicChecks();
  }
  
  private setupEventListeners(): void {
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
  }
  
  private handleOnline(): void {
    this.updateConnectionStatus(true);
  }
  
  private handleOffline(): void {
    this.updateConnectionStatus(false);
  }
  
  private updateConnectionStatus(isOnline: boolean): void {
    if (this.isOnlineState !== isOnline) {
      this.isOnlineState = isOnline;
      this.notifyListeners(isOnline);
    }
  }
  
  private notifyListeners(isOnline: boolean): void {
    this.listeners.forEach(listener => {
      try {
        listener(isOnline);
      } catch (error) {
        console.error('Error in offline detection listener:', error);
      }
    });
  }
  
  private startPeriodicChecks(): void {
    // Check connectivity every 30 seconds
    this.checkInterval = window.setInterval(() => {
      this.performConnectivityCheck();
    }, 30000);
  }
  
  private async performConnectivityCheck(): Promise<void> {
    try {
      // Try to fetch a small resource to verify actual connectivity
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const isActuallyOnline = response.ok;
      
      // Compare with navigator.onLine
      if (navigator.onLine !== isActuallyOnline) {
        this.updateConnectionStatus(isActuallyOnline);
      }
    } catch (error) {
      // If fetch fails, we're likely offline
      if (navigator.onLine) {
        this.updateConnectionStatus(false);
      }
    }
  }
  
  public isOnline(): boolean {
    return this.isOnlineState;
  }
  
  public addListener(callback: (isOnline: boolean) => void): () => void {
    this.listeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }
  
  public async checkConnectivityNow(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('/manifest.json', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const isOnline = response.ok;
      this.updateConnectionStatus(isOnline);
      return isOnline;
    } catch (error) {
      this.updateConnectionStatus(false);
      return false;
    }
  }
  
  public getConnectionInfo(): {
    isOnline: boolean;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
  } {
    const info: any = {
      isOnline: this.isOnlineState
    };
    
    // Add network information if available
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        info.effectiveType = connection.effectiveType;
        info.downlink = connection.downlink;
        info.rtt = connection.rtt;
      }
    }
    
    return info;
  }
  
  public destroy(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    this.listeners.clear();
  }
}

// Global instance
export const offlineDetection = new OfflineDetectionService();