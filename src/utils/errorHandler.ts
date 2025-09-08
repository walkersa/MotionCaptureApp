// Error handling utilities for video processing

export interface ProcessingError {
  code: string;
  message: string;
  details?: any;
  suggestions?: string[];
  recoverable?: boolean;
}

export class VideoProcessingError extends Error {
  code: string;
  details?: any;
  suggestions: string[];
  recoverable: boolean;

  constructor(code: string, message: string, options: {
    details?: any;
    suggestions?: string[];
    recoverable?: boolean;
  } = {}) {
    super(message);
    this.name = 'VideoProcessingError';
    this.code = code;
    this.details = options.details;
    this.suggestions = options.suggestions || [];
    this.recoverable = options.recoverable || false;
  }
}

export class ErrorHandler {
  static handleVideoError(error: Error | any): ProcessingError {
    // FFmpeg-specific errors
    if (error.message?.includes('ffmpeg')) {
      return this.handleFFmpegError(error);
    }
    
    // File-related errors
    if (error.message?.includes('File') || error.name === 'NotFoundError') {
      return this.handleFileError(error);
    }
    
    // Memory-related errors
    if (error.message?.includes('memory') || error.message?.includes('out of memory')) {
      return this.handleMemoryError(error);
    }
    
    // Network-related errors
    if (error.message?.includes('network') || error.message?.includes('fetch')) {
      return this.handleNetworkError(error);
    }
    
    // Codec-related errors
    if (error.message?.includes('codec') || error.message?.includes('format')) {
      return this.handleCodecError(error);
    }
    
    // Worker-related errors
    if (error.message?.includes('worker') || error.message?.includes('Worker')) {
      return this.handleWorkerError(error);
    }
    
    // Generic error
    return this.handleGenericError(error);
  }

  private static handleFFmpegError(error: Error): ProcessingError {
    const message = error.message.toLowerCase();
    
    if (message.includes('invalid data')) {
      return {
        code: 'INVALID_VIDEO_DATA',
        message: 'The video file appears to be corrupted or invalid',
        suggestions: [
          'Try a different video file',
          'Ensure the video file is not corrupted',
          'Check if the video format is supported'
        ],
        recoverable: true
      };
    }
    
    if (message.includes('no such file')) {
      return {
        code: 'FILE_NOT_FOUND',
        message: 'Video file could not be found or accessed',
        suggestions: [
          'Re-upload the video file',
          'Check if the file was removed during processing'
        ],
        recoverable: true
      };
    }
    
    if (message.includes('permission denied')) {
      return {
        code: 'PERMISSION_DENIED',
        message: 'Insufficient permissions to process the video file',
        suggestions: [
          'Reload the page and try again',
          'Ensure the browser has necessary permissions'
        ],
        recoverable: true
      };
    }
    
    return {
      code: 'FFMPEG_ERROR',
      message: 'FFmpeg processing failed: ' + error.message,
      details: error,
      suggestions: [
        'Try processing the video again',
        'Use a different video format',
        'Reduce video quality or resolution'
      ],
      recoverable: true
    };
  }

  private static handleFileError(error: Error): ProcessingError {
    return {
      code: 'FILE_ERROR',
      message: 'File processing error: ' + error.message,
      details: error,
      suggestions: [
        'Ensure the file is a valid video format',
        'Check file permissions',
        'Try uploading the file again'
      ],
      recoverable: true
    };
  }

  private static handleMemoryError(error: Error): ProcessingError {
    return {
      code: 'MEMORY_ERROR',
      message: 'Insufficient memory to process the video',
      details: error,
      suggestions: [
        'Try processing a smaller video file',
        'Close other browser tabs to free memory',
        'Reduce video quality or resolution',
        'Process videos one at a time instead of batch processing'
      ],
      recoverable: true
    };
  }

  private static handleNetworkError(error: Error): ProcessingError {
    return {
      code: 'NETWORK_ERROR',
      message: 'Network error during video processing',
      details: error,
      suggestions: [
        'Check your internet connection',
        'The app works offline after initial setup',
        'Reload the page if components failed to load'
      ],
      recoverable: true
    };
  }

  private static handleCodecError(error: Error): ProcessingError {
    return {
      code: 'CODEC_ERROR',
      message: 'Unsupported video format or codec',
      details: error,
      suggestions: [
        'Convert video to MP4 format',
        'Use H.264 codec for best compatibility',
        'Try a different video file'
      ],
      recoverable: true
    };
  }

  private static handleWorkerError(error: Error): ProcessingError {
    return {
      code: 'WORKER_ERROR',
      message: 'Background processing failed',
      details: error,
      suggestions: [
        'Reload the page to restart processing',
        'Ensure your browser supports Web Workers',
        'Try processing without background mode'
      ],
      recoverable: true
    };
  }

  private static handleGenericError(error: Error): ProcessingError {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || 'An unexpected error occurred during video processing',
      details: error,
      suggestions: [
        'Try processing the video again',
        'Reload the page and retry',
        'Check browser console for detailed error information'
      ],
      recoverable: true
    };
  }

  static createRecoveryActions(error: ProcessingError): Array<{
    label: string;
    action: () => void;
    primary?: boolean;
  }> {
    const actions = [];
    
    if (error.recoverable) {
      actions.push({
        label: 'Try Again',
        action: () => window.location.reload(),
        primary: true
      });
    }
    
    switch (error.code) {
      case 'MEMORY_ERROR':
        actions.push({
          label: 'Process Smaller File',
          action: () => {
            // This would be handled by the parent component
            console.log('Suggest smaller file processing');
          }
        });
        break;
        
      case 'CODEC_ERROR':
        actions.push({
          label: 'Convert to MP4',
          action: () => {
            // This would open a help dialog or conversion tool
            console.log('Suggest format conversion');
          }
        });
        break;
        
      case 'NETWORK_ERROR':
        actions.push({
          label: 'Work Offline',
          action: () => {
            // Switch to offline mode
            console.log('Switch to offline mode');
          }
        });
        break;
    }
    
    actions.push({
      label: 'Get Help',
      action: () => {
        // Open help documentation
        window.open('/help', '_blank');
      }
    });
    
    return actions;
  }

  static logError(error: ProcessingError, context?: any) {
    console.group('🎬 Video Processing Error');
    console.error('Code:', error.code);
    console.error('Message:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
    if (context) {
      console.error('Context:', context);
    }
    console.error('Suggestions:', error.suggestions);
    console.error('Recoverable:', error.recoverable);
    console.groupEnd();
    
    // In production, you might want to send this to an error tracking service
    // ErrorTrackingService.capture(error, context);
  }
}

// Utility function for async error handling
export async function withErrorHandling<T>(
  asyncFn: () => Promise<T>,
  context?: string
): Promise<{ result?: T; error?: ProcessingError }> {
  try {
    const result = await asyncFn();
    return { result };
  } catch (error) {
    const processedError = ErrorHandler.handleVideoError(error);
    ErrorHandler.logError(processedError, { context });
    return { error: processedError };
  }
}

// Custom error boundary hook for React components
export function useErrorBoundary() {
  return (error: Error, errorInfo?: any) => {
    const processedError = ErrorHandler.handleVideoError(error);
    ErrorHandler.logError(processedError, errorInfo);
    
    // In a real app, you might want to show a toast notification or error dialog
    console.error('Component error boundary triggered:', processedError);
  };
}