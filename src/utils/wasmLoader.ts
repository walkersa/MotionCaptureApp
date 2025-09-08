// WebAssembly module loader for compute-intensive operations
export class WasmLoader {
  private static instance: WasmLoader;
  private wasmModules: Map<string, any> = new Map();
  private loadingPromises: Map<string, Promise<any>> = new Map();

  private constructor() {}

  static getInstance(): WasmLoader {
    if (!WasmLoader.instance) {
      WasmLoader.instance = new WasmLoader();
    }
    return WasmLoader.instance;
  }

  async loadModule(name: string, wasmPath: string): Promise<any> {
    // Return cached module if already loaded
    if (this.wasmModules.has(name)) {
      return this.wasmModules.get(name);
    }

    // Return existing loading promise if module is currently being loaded
    if (this.loadingPromises.has(name)) {
      return this.loadingPromises.get(name);
    }

    // Create new loading promise
    const loadingPromise = this.loadWasmModule(name, wasmPath);
    this.loadingPromises.set(name, loadingPromise);

    try {
      const module = await loadingPromise;
      this.wasmModules.set(name, module);
      this.loadingPromises.delete(name);
      return module;
    } catch (error) {
      this.loadingPromises.delete(name);
      throw error;
    }
  }

  private async loadWasmModule(name: string, wasmPath: string): Promise<any> {
    try {
      // Check if WebAssembly is supported
      if (typeof WebAssembly !== 'object') {
        throw new Error('WebAssembly not supported in this browser');
      }

      // Load the WebAssembly binary
      console.log(`Loading WASM module: ${name} from ${wasmPath}`);
      const wasmBinary = await fetch(wasmPath);
      
      if (!wasmBinary.ok) {
        throw new Error(`Failed to fetch WASM module: ${wasmBinary.statusText}`);
      }

      const bytes = await wasmBinary.arrayBuffer();
      
      // Compile and instantiate the WebAssembly module
      const wasmModule = await WebAssembly.compile(bytes);
      const wasmInstance = await WebAssembly.instantiate(wasmModule, {
        env: {
          // Provide any required imports here
          memory: new WebAssembly.Memory({ initial: 256 }),
          console_log: (ptr: number, len: number) => {
            // Helper for debugging from WASM
            console.log('WASM log:', ptr, len);
          }
        }
      });

      console.log(`WASM module ${name} loaded successfully`);
      return {
        instance: wasmInstance,
        module: wasmModule,
        exports: wasmInstance.exports
      };
    } catch (error) {
      console.error(`Failed to load WASM module ${name}:`, error);
      throw error;
    }
  }

  isModuleLoaded(name: string): boolean {
    return this.wasmModules.has(name);
  }

  getModule(name: string): any | null {
    return this.wasmModules.get(name) || null;
  }

  unloadModule(name: string): void {
    this.wasmModules.delete(name);
    this.loadingPromises.delete(name);
  }

  // Utility method to check WebAssembly support
  static isSupported(): boolean {
    return (
      typeof WebAssembly === 'object' &&
      typeof WebAssembly.instantiate === 'function'
    );
  }

  // Get WebAssembly feature support information
  static getFeatureSupport(): {
    basic: boolean;
    threads: boolean;
    simd: boolean;
    bulkMemory: boolean;
  } {
    const basic = WasmLoader.isSupported();
    
    // Check for threads support (SharedArrayBuffer required)
    const threads = basic && typeof SharedArrayBuffer !== 'undefined';
    
    // Check for SIMD support (this is a simplified check)
    let simd = false;
    if (basic) {
      try {
        // This is a basic check - in reality you'd test with actual SIMD instructions
        simd = typeof WebAssembly.validate === 'function';
      } catch {
        simd = false;
      }
    }
    
    // Check for bulk memory operations (simplified check)
    const bulkMemory = basic && typeof WebAssembly.Memory.prototype.grow === 'function';
    
    return { basic, threads, simd, bulkMemory };
  }
}

// Singleton instance
export const wasmLoader = WasmLoader.getInstance();

// Preload common WASM modules
export async function preloadCommonModules(): Promise<void> {
  const featureSupport = WasmLoader.getFeatureSupport();
  
  console.log('WebAssembly feature support:', featureSupport);
  
  if (!featureSupport.basic) {
    console.warn('WebAssembly not supported - falling back to JavaScript implementations');
    return;
  }

  try {
    // These would be actual WASM modules for motion capture processing
    // For now, we'll just log that the system is ready
    console.log('WebAssembly system initialized and ready for compute-intensive operations');
    
    // In a real implementation, you might preload modules like:
    // await wasmLoader.loadModule('pose-estimation', '/wasm/pose_estimation.wasm');
    // await wasmLoader.loadModule('animation-export', '/wasm/animation_export.wasm');
  } catch (error) {
    console.error('Failed to preload WASM modules:', error);
  }
}