import { useState, useCallback } from 'react';
import { CaptureType, CAPTURE_TYPE_CONFIGS, VideoUploadState, ProcessedVideo } from '@/types/video';
import { videoProcessor } from '@/utils/videoProcessor';

interface BatchUploadItem {
  id: string;
  file: File;
  captureType: CaptureType | null;
  state: VideoUploadState;
}

interface BatchVideoUploadProps {
  onVideosProcessed?: (processedVideos: ProcessedVideo[]) => void;
  maxFiles?: number;
}

const BatchVideoUpload = ({ 
  onVideosProcessed, 
  maxFiles = 5 
}: BatchVideoUploadProps) => {
  const [uploadItems, setUploadItems] = useState<BatchUploadItem[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const addFiles = useCallback((files: File[]) => {
    const newItems: BatchUploadItem[] = files.slice(0, maxFiles - uploadItems.length).map(file => ({
      id: crypto.randomUUID(),
      file,
      captureType: suggestCaptureType(file.name),
      state: {
        file,
        captureType: suggestCaptureType(file.name),
        isProcessing: false,
        progress: 0,
        currentStep: '',
        error: null,
        validation: videoProcessor.validateVideoFile(file)
      }
    }));

    setUploadItems(prev => [...prev, ...newItems]);
  }, [uploadItems.length, maxFiles]);

  const suggestCaptureType = (filename: string): CaptureType => {
    const name = filename.toLowerCase();
    if (name.includes('hand') || name.includes('gesture')) return 'hand';
    if (name.includes('face') || name.includes('facial') || name.includes('expression')) return 'face';
    if (name.includes('pose') || name.includes('body') || name.includes('full')) return 'pose';
    if (name.includes('holistic') || name.includes('complete')) return 'holistic';
    return 'pose'; // Default
  };

  const updateItemCaptureType = useCallback((itemId: string, captureType: CaptureType) => {
    setUploadItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, captureType, state: { ...item.state, captureType } }
        : item
    ));
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setUploadItems(prev => prev.filter(item => item.id !== itemId));
  }, []);

  const processBatch = useCallback(async () => {
    const validItems = uploadItems.filter(item => 
      item.captureType && item.state.validation?.isValid
    );

    if (validItems.length === 0) return;

    setIsProcessingBatch(true);
    setBatchProgress({ current: 0, total: validItems.length });

    const processedVideos: ProcessedVideo[] = [];

    try {
      await videoProcessor.initialize();

      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        setBatchProgress({ current: i, total: validItems.length });

        // Update item state to processing
        setUploadItems(prev => prev.map(prevItem => 
          prevItem.id === item.id
            ? {
                ...prevItem,
                state: {
                  ...prevItem.state,
                  isProcessing: true,
                  progress: 0,
                  currentStep: 'Processing...'
                }
              }
            : prevItem
        ));

        try {
          // Process individual video
          const metadata = await videoProcessor.extractMetadata(item.file);
          
          setUploadItems(prev => prev.map(prevItem => 
            prevItem.id === item.id
              ? {
                  ...prevItem,
                  state: { ...prevItem.state, progress: 25, currentStep: 'Generating thumbnail...' }
                }
              : prevItem
          ));

          const thumbnail = await videoProcessor.generateThumbnail(item.file, 1);
          
          setUploadItems(prev => prev.map(prevItem => 
            prevItem.id === item.id
              ? {
                  ...prevItem,
                  state: { ...prevItem.state, progress: 50, currentStep: 'Extracting frames...' }
                }
              : prevItem
          ));

          const frames = await videoProcessor.extractFrames(item.file, {
            fps: 5,
            duration: Math.min(metadata.duration, 10),
            width: 512,
            height: 512
          });

          setUploadItems(prev => prev.map(prevItem => 
            prevItem.id === item.id
              ? {
                  ...prevItem,
                  state: { ...prevItem.state, progress: 100, currentStep: 'Complete!' }
                }
              : prevItem
          ));

          const processedVideo: ProcessedVideo = {
            id: crypto.randomUUID(),
            originalFile: item.file,
            captureType: item.captureType!,
            metadata,
            thumbnail,
            frames,
            processedAt: new Date(),
            status: 'completed'
          };

          processedVideos.push(processedVideo);

        } catch (error) {
          console.error(`Failed to process ${item.file.name}:`, error);
          setUploadItems(prev => prev.map(prevItem => 
            prevItem.id === item.id
              ? {
                  ...prevItem,
                  state: {
                    ...prevItem.state,
                    isProcessing: false,
                    error: error instanceof Error ? error.message : 'Processing failed'
                  }
                }
              : prevItem
          ));
        }
      }

      setBatchProgress({ current: validItems.length, total: validItems.length });
      onVideosProcessed?.(processedVideos);

      // Clear processed items after a delay
      setTimeout(() => {
        setUploadItems(prev => prev.filter(item => !validItems.includes(item)));
        setIsProcessingBatch(false);
        setBatchProgress({ current: 0, total: 0 });
      }, 3000);

    } catch (error) {
      console.error('Batch processing failed:', error);
      setIsProcessingBatch(false);
    }
  }, [uploadItems, onVideosProcessed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('video/') || videoProcessor.isVideoFormatSupported(file.name)
    );
    addFiles(files);
  }, [addFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    addFiles(files);
  }, [addFiles]);

  const validItemsCount = uploadItems.filter(item => 
    item.captureType && item.state.validation?.isValid
  ).length;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Upload Zone */}
      <div
        className="drag-zone border-dashed"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <input
          type="file"
          multiple
          accept="video/*"
          onChange={handleFileSelect}
          className="hidden"
          id="batch-video-upload"
        />
        
        <div className="text-center">
          <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
            Batch Video Upload
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Upload multiple videos for batch processing (up to {maxFiles} files)
          </p>
          <label htmlFor="batch-video-upload" className="btn btn-primary cursor-pointer">
            Choose Video Files
          </label>
        </div>
      </div>

      {/* Batch Progress */}
      {isProcessingBatch && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Processing Batch ({batchProgress.current} of {batchProgress.total})
            </h4>
            <span className="text-sm text-blue-600 dark:text-blue-400">
              {Math.round((batchProgress.current / batchProgress.total) * 100)}%
            </span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-bar-fill bg-blue-500"
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload Items */}
      {uploadItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Videos to Process ({uploadItems.length})
            </h3>
            {validItemsCount > 0 && !isProcessingBatch && (
              <button
                onClick={processBatch}
                className="btn btn-primary"
              >
                Process All ({validItemsCount})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {uploadItems.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                {/* File Info */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {item.file.name}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {(item.file.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                  {!item.state.isProcessing && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Validation Status */}
                {item.state.validation && (
                  <div className={`mb-3 p-2 rounded text-xs ${
                    item.state.validation.isValid
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                  }`}>
                    {item.state.validation.isValid ? '✓ Valid' : '✗ Invalid'}
                    {item.state.validation.errors.length > 0 && (
                      <div className="mt-1">
                        {item.state.validation.errors[0]}
                      </div>
                    )}
                  </div>
                )}

                {/* Capture Type Selector */}
                {item.state.validation?.isValid && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Capture Type
                    </label>
                    <select
                      value={item.captureType || ''}
                      onChange={(e) => updateItemCaptureType(item.id, e.target.value as CaptureType)}
                      className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={item.state.isProcessing}
                    >
                      <option value="">Select type...</option>
                      {CAPTURE_TYPE_CONFIGS.map(config => (
                        <option key={config.id} value={config.id}>
                          {config.displayName} ({config.landmarks} landmarks)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Processing Status */}
                {item.state.isProcessing && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {item.state.currentStep}
                      </span>
                      <span className="text-xs font-medium text-gray-900 dark:text-white">
                        {item.state.progress}%
                      </span>
                    </div>
                    <div className="progress-bar h-1">
                      <div 
                        className="progress-bar-fill h-1"
                        style={{ width: `${item.state.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {item.state.error && (
                  <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-800 dark:text-red-200">
                    Error: {item.state.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchVideoUpload;