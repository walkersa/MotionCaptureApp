// Video Processing Web Worker
// This worker handles intensive video processing operations in the background

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

interface ProcessingMessage {
  id: string;
  type: 'process' | 'extract-frames' | 'generate-thumbnail' | 'extract-metadata';
  payload: any;
}

interface ProcessingResponse {
  id: string;
  type: 'progress' | 'complete' | 'error';
  payload: any;
}

class VideoProcessingWorker {
  private ffmpeg: FFmpeg;
  private isLoaded = false;

  constructor() {
    this.ffmpeg = new FFmpeg();
    this.setupFFmpeg();
  }

  private async setupFFmpeg() {
    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      
      this.ffmpeg.on('log', ({ message }) => {
        this.postMessage({
          id: 'log',
          type: 'progress',
          payload: { message, step: 'FFmpeg Log' }
        });
      });

      this.ffmpeg.on('progress', ({ progress, time }) => {
        this.postMessage({
          id: 'progress',
          type: 'progress',
          payload: { 
            progress: Math.round(progress * 100), 
            step: `Processing... (${time}s)`,
            time 
          }
        });
      });

      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      this.isLoaded = true;
      console.log('FFmpeg loaded in worker');
    } catch (error) {
      console.error('Failed to load FFmpeg in worker:', error);
      this.postMessage({
        id: 'init',
        type: 'error',
        payload: { error: 'Failed to initialize video processor' }
      });
    }
  }

  private postMessage(response: ProcessingResponse) {
    // @ts-ignore - Worker context
    self.postMessage(response);
  }

  async processMessage(message: ProcessingMessage) {
    const { id, type, payload } = message;

    try {
      if (!this.isLoaded) {
        await this.setupFFmpeg();
      }

      switch (type) {
        case 'extract-metadata':
          await this.extractMetadata(id, payload.fileBuffer, payload.fileName);
          break;
        
        case 'generate-thumbnail':
          await this.generateThumbnail(id, payload.fileBuffer, payload.fileName, payload.timeSeconds, payload.size);
          break;
        
        case 'extract-frames':
          await this.extractFrames(id, payload.fileBuffer, payload.fileName, payload.options);
          break;
        
        case 'process':
          await this.processVideo(id, payload.fileBuffer, payload.fileName, payload.options);
          break;
        
        default:
          throw new Error(`Unknown processing type: ${type}`);
      }
    } catch (error) {
      this.postMessage({
        id,
        type: 'error',
        payload: { error: error instanceof Error ? error.message : 'Processing failed' }
      });
    }
  }

  private async extractMetadata(id: string, fileBuffer: ArrayBuffer, fileName: string) {
    this.postMessage({ id, type: 'progress', payload: { progress: 10, step: 'Extracting metadata...' } });

    const inputName = `input.${this.getFileExtension(fileName)}`;
    await this.ffmpeg.writeFile(inputName, new Uint8Array(fileBuffer));

    // For demo purposes, estimate metadata
    // In production, you'd parse actual FFmpeg output
    const estimatedMetadata = {
      duration: this.estimateDuration(fileBuffer.byteLength),
      width: 1920,
      height: 1080,
      fps: 30,
      codec: this.detectCodecFromExtension(fileName),
      fileSize: fileBuffer.byteLength
    };

    await this.ffmpeg.deleteFile(inputName);

    this.postMessage({ 
      id, 
      type: 'complete', 
      payload: { metadata: estimatedMetadata } 
    });
  }

  private async generateThumbnail(
    id: string, 
    fileBuffer: ArrayBuffer, 
    fileName: string, 
    timeSeconds: number = 1,
    size: { width: number; height: number } = { width: 320, height: 240 }
  ) {
    this.postMessage({ id, type: 'progress', payload: { progress: 20, step: 'Generating thumbnail...' } });

    const inputName = `input.${this.getFileExtension(fileName)}`;
    const outputName = 'thumbnail.jpg';

    await this.ffmpeg.writeFile(inputName, new Uint8Array(fileBuffer));

    await this.ffmpeg.exec([
      '-i', inputName,
      '-ss', String(timeSeconds),
      '-vframes', '1',
      '-vf', `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease:flags=lanczos`,
      '-q:v', '2',
      outputName
    ]);

    const thumbnailData = await this.ffmpeg.readFile(outputName);
    
    await this.ffmpeg.deleteFile(inputName);
    await this.ffmpeg.deleteFile(outputName);

    // Convert to transferable ArrayBuffer
    const thumbnailBuffer = new ArrayBuffer(thumbnailData.length);
    new Uint8Array(thumbnailBuffer).set(new Uint8Array(thumbnailData as ArrayBuffer));

    this.postMessage({ 
      id, 
      type: 'complete', 
      payload: { thumbnailBuffer } 
    });
  }

  private async extractFrames(
    id: string, 
    fileBuffer: ArrayBuffer, 
    fileName: string, 
    options: {
      fps?: number;
      startTime?: number;
      duration?: number;
      width?: number;
      height?: number;
    } = {}
  ) {
    const {
      fps = 30,
      startTime = 0,
      duration,
      width = 512,
      height = 512
    } = options;

    this.postMessage({ id, type: 'progress', payload: { progress: 30, step: 'Extracting frames...' } });

    const inputName = `input.${this.getFileExtension(fileName)}`;
    await this.ffmpeg.writeFile(inputName, new Uint8Array(fileBuffer));

    const args = [
      '-i', inputName,
      '-ss', String(startTime)
    ];

    if (duration) {
      args.push('-t', String(duration));
    }

    args.push(
      '-vf', `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
      '-q:v', '2',
      'frame_%04d.jpg'
    );

    await this.ffmpeg.exec(args);

    // Read extracted frames
    const frameBuffers: ArrayBuffer[] = [];
    let frameIndex = 1;
    
    try {
      while (frameIndex <= 300) { // Limit to 300 frames max
        const frameName = `frame_${frameIndex.toString().padStart(4, '0')}.jpg`;
        
        try {
          const frameData = await this.ffmpeg.readFile(frameName);
          
          // Convert to transferable ArrayBuffer
          const frameBuffer = new ArrayBuffer(frameData.length);
          new Uint8Array(frameBuffer).set(new Uint8Array(frameData as ArrayBuffer));
          frameBuffers.push(frameBuffer);
          
          await this.ffmpeg.deleteFile(frameName);
          frameIndex++;

          // Update progress
          if (frameIndex % 10 === 0) {
            this.postMessage({ 
              id, 
              type: 'progress', 
              payload: { 
                progress: 30 + Math.min(60, (frameIndex / 100) * 60), 
                step: `Extracted ${frameIndex} frames...` 
              } 
            });
          }
        } catch {
          // No more frames
          break;
        }
      }
    } catch (error) {
      console.error('Error extracting frames:', error);
    }

    await this.ffmpeg.deleteFile(inputName);

    this.postMessage({ 
      id, 
      type: 'complete', 
      payload: { frameBuffers } 
    });
  }

  private async processVideo(
    id: string, 
    fileBuffer: ArrayBuffer, 
    fileName: string, 
    options: {
      outputFormat?: 'mp4' | 'webm';
      fps?: number;
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
    } = {}
  ) {
    const {
      outputFormat = 'mp4',
      fps = 30,
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 75
    } = options;

    this.postMessage({ id, type: 'progress', payload: { progress: 0, step: 'Starting video processing...' } });

    const inputName = `input.${this.getFileExtension(fileName)}`;
    const outputName = `output.${outputFormat}`;

    await this.ffmpeg.writeFile(inputName, new Uint8Array(fileBuffer));

    this.postMessage({ id, type: 'progress', payload: { progress: 10, step: 'Processing video...' } });

    const args = [
      '-i', inputName,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', String(Math.round(51 - (quality * 0.51))),
      '-r', String(fps),
      '-vf', `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`,
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputName
    ];

    await this.ffmpeg.exec(args);

    this.postMessage({ id, type: 'progress', payload: { progress: 90, step: 'Finalizing...' } });

    const outputData = await this.ffmpeg.readFile(outputName);
    
    // Convert to transferable ArrayBuffer
    const outputBuffer = new ArrayBuffer(outputData.length);
    new Uint8Array(outputBuffer).set(new Uint8Array(outputData as ArrayBuffer));

    await this.ffmpeg.deleteFile(inputName);
    await this.ffmpeg.deleteFile(outputName);

    this.postMessage({ 
      id, 
      type: 'complete', 
      payload: { 
        videoBuffer: outputBuffer,
        mimeType: `video/${outputFormat}`
      } 
    });
  }

  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  private detectCodecFromExtension(filename: string): string {
    const ext = this.getFileExtension(filename);
    const codecMap: { [key: string]: string } = {
      'mp4': 'h264',
      'mov': 'h264',
      'avi': 'xvid',
      'webm': 'vp9',
      'mkv': 'h264'
    };
    
    return codecMap[ext] || 'unknown';
  }

  private estimateDuration(fileSize: number): number {
    // Very rough estimate: assume 1MB per second for typical video
    return fileSize / (1024 * 1024);
  }
}

// Initialize worker
const worker = new VideoProcessingWorker();

// Handle messages from main thread
// @ts-ignore - Worker context
self.onmessage = async (event) => {
  const message: ProcessingMessage = event.data;
  await worker.processMessage(message);
};