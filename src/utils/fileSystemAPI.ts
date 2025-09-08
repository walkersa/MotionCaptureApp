import { FileSystemFileHandle } from '@/types';

// File System Access API utilities with polyfill fallback
export class FileSystemService {
  static isSupported(): boolean {
    return 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
  }
  
  static async openVideoFile(): Promise<File> {
    if (this.isSupported()) {
      try {
        const [fileHandle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'Video files',
              accept: {
                'video/*': ['.mp4', '.mov', '.avi', '.webm', '.mkv']
              }
            }
          ],
          multiple: false
        });
        return await fileHandle.getFile();
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw new Error('File selection cancelled');
        }
        throw error;
      }
    } else {
      return this.fallbackOpenFile();
    }
  }
  
  static async saveFile(
    data: ArrayBuffer | Uint8Array | string,
    filename: string,
    mimeType: string = 'application/octet-stream'
  ): Promise<void> {
    if (this.isSupported()) {
      try {
        const fileHandle: FileSystemFileHandle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'Export files',
              accept: { [mimeType]: [`.${filename.split('.').pop()}`] }
            }
          ]
        });
        
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw new Error('File save cancelled');
        }
        throw error;
      }
    } else {
      this.fallbackSaveFile(data, filename, mimeType);
    }
  }
  
  static async openDirectory(): Promise<FileSystemDirectoryHandle | null> {
    if (this.isSupported() && 'showDirectoryPicker' in window) {
      try {
        return await (window as any).showDirectoryPicker();
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return null;
        }
        throw error;
      }
    }
    return null;
  }
  
  // Fallback methods for browsers without File System Access API
  private static async fallbackOpenFile(): Promise<File> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      
      input.onchange = (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
          resolve(file);
        } else {
          reject(new Error('No file selected'));
        }
      };
      
      input.oncancel = () => {
        reject(new Error('File selection cancelled'));
      };
      
      input.click();
    });
  }
  
  private static fallbackSaveFile(
    data: ArrayBuffer | Uint8Array | string,
    filename: string,
    mimeType: string
  ): void {
    let blob: Blob;
    
    if (typeof data === 'string') {
      blob = new Blob([data], { type: mimeType });
    } else {
      blob = new Blob([data], { type: mimeType });
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  static async requestPersistentStorage(): Promise<boolean> {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      try {
        return await navigator.storage.persist();
      } catch (error) {
        console.warn('Failed to request persistent storage:', error);
        return false;
      }
    }
    return false;
  }
  
  static async checkStoragePermission(): Promise<boolean> {
    if ('storage' in navigator && 'persisted' in navigator.storage) {
      return await navigator.storage.persisted();
    }
    return false;
  }
}