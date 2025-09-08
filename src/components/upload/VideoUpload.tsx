import { useState, useCallback, useRef } from 'react';
import { CaptureType, CAPTURE_TYPE_CONFIGS, VideoUploadState } from '@/types/video';
import { videoProcessor } from '@/utils/videoProcessor';
import CaptureTypeSelector from './CaptureTypeSelector';
import VideoPreview from './VideoPreview';
import UploadProgress from './UploadProgress';

interface VideoUploadProps {
  onVideoProcessed?: (processedVideo: any) => void;
  maxFileSize?: number;
  allowedFormats?: string[];
}

const VideoUpload = ({ 
  onVideoProcessed, 
  maxFileSize = 100 * 1024 * 1024, // 100MB
  allowedFormats = ['mp4', 'mov', 'avi', 'webm', 'mkv']
}: VideoUploadProps) => {
  const [uploadState, setUploadState] = useState<VideoUploadState>({
    file: null,
    captureType: null,
    isProcessing: false,
    progress: 0,
    currentStep: '',
    error: null,
    validation: null
  });

  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  }, []);

  const handleFileSelection = useCallback((file: File) => {
    // Validate file
    const validation = videoProcessor.validateVideoFile(file);
    
    setUploadState(prev => ({
      ...prev,
      file,
      validation,
      error: null
    }));

    // Auto-select capture type based on filename or content
    // This is a simple heuristic - in production you might analyze the video content
    const suggestedCaptureType = suggestCaptureType(file.name);
    if (suggestedCaptureType) {
      handleCaptureTypeSelect(suggestedCaptureType);
    }
  }, []);

  const suggestCaptureType = (filename: string): CaptureType | null => {
    const name = filename.toLowerCase();
    if (name.includes('hand') || name.includes('gesture')) return 'hand';
    if (name.includes('face') || name.includes('facial') || name.includes('expression')) return 'face';
    if (name.includes('pose') || name.includes('body') || name.includes('full')) return 'pose';
    if (name.includes('holistic') || name.includes('complete')) return 'holistic';
    return 'pose'; // Default suggestion
  };

  const handleCaptureTypeSelect = useCallback((captureType: CaptureType) => {
    setUploadState(prev => ({
      ...prev,
      captureType
    }));
  }, []);

  const handleProcessVideo = useCallback(async () => {
    if (!uploadState.file || !uploadState.captureType) return;

    setUploadState(prev => ({
      ...prev,
      isProcessing: true,
      progress: 0,
      currentStep: 'Initializing video processor...',
      error: null
    }));

    try {
      // Step 1: Initialize FFmpeg
      setUploadState(prev => ({ ...prev, progress: 10, currentStep: 'Loading video processor...' }));
      await videoProcessor.initialize();

      // Step 2: Extract metadata
      setUploadState(prev => ({ ...prev, progress: 20, currentStep: 'Extracting video metadata...' }));
      const metadata = await videoProcessor.extractMetadata(uploadState.file);

      // Step 3: Generate thumbnail
      setUploadState(prev => ({ ...prev, progress: 40, currentStep: 'Generating thumbnail...' }));
      const thumbnail = await videoProcessor.generateThumbnail(uploadState.file, 1);

      // Step 4: Extract frames (sample)
      setUploadState(prev => ({ ...prev, progress: 60, currentStep: 'Extracting video frames...' }));
      const frames = await videoProcessor.extractFrames(uploadState.file, {
        fps: 5, // Sample frames for preview
        duration: Math.min(metadata.duration, 10), // Limit to 10 seconds
        width: 512,
        height: 512
      });

      // Step 5: Validate content for capture type
      setUploadState(prev => ({ ...prev, progress: 80, currentStep: 'Validating content for capture type...' }));
      const contentValidation = await validateContentForCaptureType(
        frames, 
        uploadState.captureType
      );

      if (!contentValidation.isValid) {
        throw new Error(`Content validation failed: ${contentValidation.errors.join(', ')}`);
      }

      // Step 6: Complete processing
      setUploadState(prev => ({ ...prev, progress: 100, currentStep: 'Processing complete!' }));

      const processedVideo = {
        id: crypto.randomUUID(),
        originalFile: uploadState.file,
        captureType: uploadState.captureType,
        metadata,
        thumbnail,
        frames,
        processedAt: new Date(),
        status: 'completed' as const
      };

      // Notify parent component
      onVideoProcessed?.(processedVideo);

      // Reset state after a brief delay
      setTimeout(() => {
        setUploadState({
          file: null,
          captureType: null,
          isProcessing: false,
          progress: 0,
          currentStep: '',
          error: null,
          validation: null
        });
      }, 2000);

    } catch (error) {
      console.error('Video processing failed:', error);
      setUploadState(prev => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error.message : 'Processing failed'
      }));
    }
  }, [uploadState.file, uploadState.captureType, onVideoProcessed]);

  const validateContentForCaptureType = async (
    frames: Blob[], 
    captureType: CaptureType
  ): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> => {
    // Placeholder validation - in production, this would use AI models
    // to detect hands, faces, or poses in the video frames
    
    const errors: string[] = [];
    const warnings: string[] = [];

    if (frames.length === 0) {
      errors.push('No frames could be extracted from the video');
      return { isValid: false, errors, warnings };
    }

    // Simple heuristic validation based on capture type
    switch (captureType) {
      case 'hand':
        // In production: check for hand visibility in frames
        if (frames.length < 5) {
          warnings.push('Short video may not provide enough hand gesture data');
        }
        break;
      
      case 'face':
        // In production: check for face detection in frames
        if (frames.length < 5) {
          warnings.push('Short video may not provide enough facial expression data');
        }
        break;
      
      case 'pose':
        // In production: check for full body visibility
        if (frames.length < 10) {
          warnings.push('Short video may not provide enough pose data');
        }
        break;
      
      case 'holistic':
        // In production: check for pose, hands, and face visibility
        if (frames.length < 15) {
          warnings.push('Short video may not provide enough comprehensive motion data');
        }
        break;
    }

    return { isValid: errors.length === 0, errors, warnings };
  };

  const canProcess = uploadState.file && 
                    uploadState.captureType && 
                    uploadState.validation?.isValid && 
                    !uploadState.isProcessing;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Upload Zone */}
      <div
        className={`
          drag-zone transition-all duration-200
          ${dragActive ? 'drag-over' : ''}
          ${uploadState.file ? 'border-solid border-green-300 bg-green-50 dark:bg-green-900/20' : ''}
        `}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileInputChange}
          className="hidden"
          id="video-upload"
        />
        
        {!uploadState.file ? (
          <div className="text-center">
            <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
              Upload Video for Motion Capture
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Drop your video file here or click to browse
            </p>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              <p>Supported formats: {allowedFormats.map(f => f.toUpperCase()).join(', ')}</p>
              <p>Maximum file size: {Math.round(maxFileSize / (1024 * 1024))}MB</p>
              <p>Recommended: 10 seconds or less, 1080p or lower</p>
            </div>
            <label htmlFor="video-upload" className="btn btn-primary cursor-pointer">
              Choose Video File
            </label>
          </div>
        ) : (
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-lg font-medium text-gray-900 dark:text-white">
                {uploadState.file.name}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {(uploadState.file.size / (1024 * 1024)).toFixed(1)} MB
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary mt-2"
            >
              Choose Different File
            </button>
          </div>
        )}
      </div>

      {/* Validation Results */}
      {uploadState.validation && (
        <div className={`p-4 rounded-lg ${uploadState.validation.isValid ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
          <div className="flex">
            <svg className={`w-5 h-5 mt-0.5 mr-3 ${uploadState.validation.isValid ? 'text-green-500' : 'text-red-500'}`} fill="currentColor" viewBox="0 0 20 20">
              {uploadState.validation.isValid ? (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              )}
            </svg>
            <div>
              <h4 className={`text-sm font-medium ${uploadState.validation.isValid ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                {uploadState.validation.isValid ? 'Video validation passed' : 'Video validation failed'}
              </h4>
              {uploadState.validation.errors.length > 0 && (
                <ul className="mt-2 text-sm text-red-700 dark:text-red-300 space-y-1">
                  {uploadState.validation.errors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              )}
              {uploadState.validation.warnings.length > 0 && (
                <ul className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                  {uploadState.validation.warnings.map((warning, index) => (
                    <li key={index}>⚠ {warning}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Capture Type Selection */}
      {uploadState.file && uploadState.validation?.isValid && (
        <CaptureTypeSelector
          selectedType={uploadState.captureType}
          onSelectType={handleCaptureTypeSelect}
          configs={CAPTURE_TYPE_CONFIGS}
        />
      )}

      {/* Video Preview */}
      {uploadState.file && (
        <VideoPreview
          file={uploadState.file}
          captureType={uploadState.captureType}
        />
      )}

      {/* Processing Progress */}
      {uploadState.isProcessing && (
        <UploadProgress
          progress={uploadState.progress}
          currentStep={uploadState.currentStep}
        />
      )}

      {/* Error Display */}
      {uploadState.error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-red-500 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
                Processing Error
              </h4>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                {uploadState.error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Process Button */}
      {canProcess && (
        <div className="text-center">
          <button
            onClick={handleProcessVideo}
            className="btn btn-primary text-lg px-8 py-3"
            disabled={uploadState.isProcessing}
          >
            {uploadState.isProcessing ? (
              <>
                <div className="spinner mr-2"></div>
                Processing Video...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-9-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Process for Motion Capture
              </>
            )}
          </button>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            This will extract motion data for{' '}
            <span className="font-medium">
              {CAPTURE_TYPE_CONFIGS.find(c => c.id === uploadState.captureType)?.displayName}
            </span>
          </p>
        </div>
      )}
    </div>
  );
};

export default VideoUpload;