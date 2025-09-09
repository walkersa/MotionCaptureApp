import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { VideoMetadata } from '@/types';

export interface VideoProcessingOptions {
  outputFormat?: 'mp4' | 'webm';
  fps?: number;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-100
}

export interface FrameExtractionOptions {
  fps?: number;
  startTime?: number;
  duration?: number;
  width?: number;
  height?: number;
}

export class VideoProcessor {
  private ffmpeg: FFmpeg;
  private isLoaded = false;
  private loadingPromise: Promise<void> | null = null;

  constructor() {
    this.ffmpeg = new FFmpeg();
  }

  async initialize(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = this.loadFFmpeg();
    await this.loadingPromise;
    this.isLoaded = true;
  }

  private async loadFFmpeg(): Promise<void> {
    try {
      // Use a more reliable CDN and version
      const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
      
      this.ffmpeg.on('log', ({ message }) => {
        console.debug('[FFmpeg]', message);
      });

      this.ffmpeg.on('progress', ({ progress, time }) => {
        console.log(`[FFmpeg] Progress: ${Math.round(progress * 100)}% (${time}s)`);
      });

      // Try to load FFmpeg with proper error handling
      console.log('Loading FFmpeg core files...');
      
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      
      console.log('Core URL:', coreURL);
      console.log('WASM URL:', wasmURL);

      await this.ffmpeg.load({
        coreURL,
        wasmURL,
      });

      console.log('FFmpeg loaded successfully');
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      console.error('Error details:', error);
      
      // Try fallback CDN
      try {
        console.log('Trying fallback CDN...');
        const fallbackBaseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        
        const coreURL = await toBlobURL(`${fallbackBaseURL}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${fallbackBaseURL}/ffmpeg-core.wasm`, 'application/wasm');
        
        await this.ffmpeg.load({
          coreURL,
          wasmURL,
        });
        
        console.log('FFmpeg loaded successfully with fallback CDN');
      } catch (fallbackError) {
        console.error('Fallback CDN also failed:', fallbackError);
        throw new Error('Failed to initialize video processor: Unable to load FFmpeg core files. This may be due to network restrictions or CORS issues.');
      }
    }
  }

  async extractMetadata(videoFile: File): Promise<VideoMetadata> {
    await this.initialize();

    try {
      const inputName = `input.${this.getFileExtension(videoFile.name)}`;
      
      // Write input file
      await this.ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      // Extract metadata using ffprobe-like functionality
      await this.ffmpeg.exec([
        '-i', inputName,
        '-f', 'null',
        '-'
      ]);

      // For now, we'll extract basic metadata from the File object
      // In a full implementation, you'd parse FFmpeg's output
      const metadata: VideoMetadata = {
        duration: 0, // Will be extracted from FFmpeg output
        width: 0,    // Will be extracted from FFmpeg output
        height: 0,   // Will be extracted from FFmpeg output
        fps: 30,     // Default, will be extracted from FFmpeg output
        codec: 'unknown',
        fileSize: videoFile.size
      };

      // Clean up
      await this.ffmpeg.deleteFile(inputName);

      // For demo purposes, return estimated metadata
      // In production, parse actual FFmpeg output
      return {
        ...metadata,
        duration: this.estimateDuration(videoFile.size),
        width: 1920, // Default assumption
        height: 1080,
        fps: 30,
        codec: this.detectCodecFromExtension(videoFile.name)
      };
    } catch (error) {
      console.error('Failed to extract metadata:', error);
      throw new Error('Failed to extract video metadata');
    }
  }

  async convertVideo(
    videoFile: File, 
    options: VideoProcessingOptions = {}
  ): Promise<Blob> {
    await this.initialize();

    const {
      outputFormat = 'mp4',
      fps = 30,
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 75
    } = options;

    try {
      const inputName = `input.${this.getFileExtension(videoFile.name)}`;
      const outputName = `output.${outputFormat}`;

      // Write input file
      await this.ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      // Build FFmpeg command
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

      // Read output file
      const outputData = await this.ffmpeg.readFile(outputName);
      const blob = new Blob([outputData], { 
        type: `video/${outputFormat}` 
      });

      // Clean up
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile(outputName);

      return blob;
    } catch (error) {
      console.error('Failed to convert video:', error);
      throw new Error('Failed to convert video format');
    }
  }

  async extractFrames(
    videoFile: File, 
    options: FrameExtractionOptions = {}
  ): Promise<Blob[]> {
    await this.initialize();

    const {
      fps = 30,
      startTime = 0,
      duration,
      width = 512,
      height = 512
    } = options;

    try {
      const inputName = `input.${this.getFileExtension(videoFile.name)}`;
      
      // Write input file
      await this.ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      // Build extraction command
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
      const frames: Blob[] = [];
      let frameIndex = 1;
      
      try {
        while (true) {
          const frameName = `frame_${frameIndex.toString().padStart(4, '0')}.jpg`;
          const frameData = await this.ffmpeg.readFile(frameName);
          
          frames.push(new Blob([frameData], { type: 'image/jpeg' }));
          await this.ffmpeg.deleteFile(frameName);
          
          frameIndex++;
        }
      } catch {
        // No more frames to read
      }

      // Clean up
      await this.ffmpeg.deleteFile(inputName);

      return frames;
    } catch (error) {
      console.error('Failed to extract frames:', error);
      throw new Error('Failed to extract video frames');
    }
  }

  async generateThumbnail(
    videoFile: File, 
    timeSeconds: number = 1,
    size: { width: number; height: number } = { width: 320, height: 240 }
  ): Promise<Blob> {
    await this.initialize();

    try {
      const inputName = `input.${this.getFileExtension(videoFile.name)}`;
      const outputName = 'thumbnail.jpg';

      // Write input file
      await this.ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      // Extract thumbnail
      await this.ffmpeg.exec([
        '-i', inputName,
        '-ss', String(timeSeconds),
        '-vframes', '1',
        '-vf', `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease:flags=lanczos`,
        '-q:v', '2',
        outputName
      ]);

      // Read thumbnail
      const thumbnailData = await this.ffmpeg.readFile(outputName);
      const blob = new Blob([thumbnailData], { type: 'image/jpeg' });

      // Clean up
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile(outputName);

      return blob;
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      throw new Error('Failed to generate video thumbnail');
    }
  }

  isVideoFormatSupported(filename: string): boolean {
    const supportedFormats = [
      'mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v', '3gp', 'flv'
    ];
    
    const extension = this.getFileExtension(filename).toLowerCase();
    return supportedFormats.includes(extension);
  }

  validateVideoFile(file: File): { 
    isValid: boolean; 
    errors: string[]; 
    warnings: string[] 
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file size (100MB limit)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      errors.push(`File size ${this.formatBytes(file.size)} exceeds maximum allowed size of ${this.formatBytes(maxSize)}`);
    }

    // Check file format
    if (!this.isVideoFormatSupported(file.name)) {
      errors.push(`Video format not supported. Supported formats: MP4, MOV, AVI, WebM, MKV`);
    }

    // Check file type
    if (!file.type.startsWith('video/')) {
      warnings.push('File MIME type does not indicate a video file');
    }

    // Estimate duration based on file size (rough estimate)
    const estimatedDuration = this.estimateDuration(file.size);
    if (estimatedDuration > 10) {
      warnings.push(`Estimated duration ${estimatedDuration.toFixed(1)}s may exceed 10 second limit`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
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
    // Rough estimate: assume 1MB per second for typical video
    // This is very approximate and should be replaced with actual metadata extraction
    return fileSize / (1024 * 1024);
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  terminate(): void {
    if (this.ffmpeg) {
      this.ffmpeg.terminate();
      this.isLoaded = false;
      this.loadingPromise = null;
    }
  }
}

// Singleton instance
export const videoProcessor = new VideoProcessor();