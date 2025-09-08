import { useState, useRef, useEffect } from 'react';
import { CaptureType } from '@/types/video';

interface VideoPreviewProps {
  file: File;
  captureType: CaptureType | null;
}

const VideoPreview = ({ file, captureType }: VideoPreviewProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [videoUrl, setVideoUrl] = useState<string>('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Create video URL when file changes
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);

      // Cleanup on unmount or file change
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [file]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [videoUrl]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const progressBar = progressRef.current;
    if (!video || !progressBar || !duration) return;

    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = clickX / rect.width;
    const newTime = clickRatio * duration;

    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    const video = videoRef.current;
    
    if (video) {
      video.volume = newVolume;
      setVolume(newVolume);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getPreviewOverlay = () => {
    if (!captureType) return null;

    const overlayStyles = {
      pose: {
        color: 'rgba(59, 130, 246, 0.8)',
        text: 'Body pose landmarks will be detected'
      },
      hand: {
        color: 'rgba(16, 185, 129, 0.8)',
        text: 'Hand gestures and finger positions will be tracked'
      },
      face: {
        color: 'rgba(245, 158, 11, 0.8)',
        text: 'Facial expressions and emotions will be captured'
      },
      holistic: {
        color: 'rgba(139, 92, 246, 0.8)',
        text: 'Complete body, hand, and face capture will be performed'
      }
    };

    const style = overlayStyles[captureType];

    return (
      <div className="absolute inset-0 pointer-events-none">
        {/* Capture type indicator */}
        <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-sm">
          {captureType.charAt(0).toUpperCase() + captureType.slice(1)} Capture
        </div>

        {/* Preview overlay hint */}
        <div className="absolute bottom-2 left-2 right-2">
          <div 
            className="bg-black/70 text-white px-3 py-2 rounded text-xs"
            style={{ borderLeft: `3px solid ${style.color}` }}
          >
            {style.text}
          </div>
        </div>

        {/* Simulated landmark indicators for demo */}
        {captureType === 'face' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              {/* Face outline dots */}
              <div className="w-32 h-40 relative">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-1 h-1 bg-yellow-400 rounded-full animate-pulse"
                    style={{
                      left: `${30 + Math.cos((i * Math.PI * 2) / 12) * 40}%`,
                      top: `${40 + Math.sin((i * Math.PI * 2) / 12) * 30}%`,
                      animationDelay: `${i * 0.1}s`
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Video Preview
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {file.name} • {(file.size / (1024 * 1024)).toFixed(1)} MB
        </p>
      </div>

      <div className="relative bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-auto max-h-96 object-contain"
          onClick={togglePlayPause}
        />
        
        {getPreviewOverlay()}

        {/* Video Controls Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Progress Bar */}
          <div className="mb-3">
            <div
              ref={progressRef}
              className="w-full h-2 bg-gray-600 rounded-full cursor-pointer"
              onClick={handleProgressClick}
            >
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-100"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center space-x-4">
              {/* Play/Pause Button */}
              <button
                onClick={togglePlayPause}
                className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded transition-colors"
              >
                {isPlaying ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              {/* Time Display */}
              <div className="text-sm font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            {/* Volume Control */}
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.793L4.5 14H2a1 1 0 01-1-1V7a1 1 0 011-1h2.5l3.883-2.793zm5.659 1.31a1 1 0 011.414 0 7 7 0 010 9.9 1 1 0 01-1.414-1.414 5 5 0 000-7.072 1 1 0 010-1.414zM13.5 6.464a1 1 0 011.414 0 3 3 0 010 4.243 1 1 0 01-1.414-1.414 1 1 0 000-1.415 1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Video Information */}
      <div className="p-4 bg-gray-50 dark:bg-gray-700/50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Duration:</span>
            <div className="font-medium text-gray-900 dark:text-white">
              {formatTime(duration)}
            </div>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Size:</span>
            <div className="font-medium text-gray-900 dark:text-white">
              {(file.size / (1024 * 1024)).toFixed(1)} MB
            </div>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Type:</span>
            <div className="font-medium text-gray-900 dark:text-white">
              {file.type || 'Unknown'}
            </div>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Capture:</span>
            <div className="font-medium text-gray-900 dark:text-white">
              {captureType ? captureType.charAt(0).toUpperCase() + captureType.slice(1) : 'Not selected'}
            </div>
          </div>
        </div>

        {duration > 10 && (
          <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
            <div className="flex">
              <svg className="w-5 h-5 text-yellow-500 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Video Length Notice
                </h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  This video is {formatTime(duration)} long. Only the first 10 seconds will be processed for motion capture to ensure optimal performance.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPreview;