interface UploadProgressProps {
  progress: number;
  currentStep: string;
  showDetails?: boolean;
}

const UploadProgress = ({ 
  progress, 
  currentStep, 
  showDetails = true 
}: UploadProgressProps) => {
  const progressSteps = [
    { step: 'Loading video processor...', threshold: 10 },
    { step: 'Extracting video metadata...', threshold: 20 },
    { step: 'Generating thumbnail...', threshold: 40 },
    { step: 'Extracting video frames...', threshold: 60 },
    { step: 'Validating content for capture type...', threshold: 80 },
    { step: 'Processing complete!', threshold: 100 }
  ];

  const getCurrentStepIndex = () => {
    return progressSteps.findIndex(ps => ps.step === currentStep);
  };

  const getStepStatus = (stepIndex: number) => {
    const currentIndex = getCurrentStepIndex();
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Processing Video
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Extracting motion capture data from your video...
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Progress
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {Math.round(progress)}%
          </span>
        </div>
        
        <div className="progress-bar">
          <div 
            className="progress-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Current Step */}
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            {progress === 100 ? (
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <div className="w-5 h-5">
                <div className="spinner"></div>
              </div>
            )}
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              {currentStep}
            </p>
            {progress < 100 && (
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                This may take a few moments...
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Steps */}
      {showDetails && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Processing Steps
          </h4>
          
          {progressSteps.map((step, index) => {
            const status = getStepStatus(index);
            
            return (
              <div 
                key={index}
                className={`flex items-center p-2 rounded ${
                  status === 'current' 
                    ? 'bg-blue-50 dark:bg-blue-900/20' 
                    : status === 'completed'
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : 'bg-gray-50 dark:bg-gray-700/50'
                }`}
              >
                <div className="flex-shrink-0 mr-3">
                  {status === 'completed' ? (
                    <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : status === 'current' ? (
                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    </div>
                  ) : (
                    <div className="w-5 h-5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                  )}
                </div>
                
                <div className="flex-1">
                  <p className={`text-sm ${
                    status === 'current' 
                      ? 'text-blue-800 dark:text-blue-200 font-medium' 
                      : status === 'completed'
                      ? 'text-green-800 dark:text-green-200'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {step.step}
                  </p>
                </div>
                
                {status === 'completed' && (
                  <div className="flex-shrink-0 ml-2">
                    <span className="text-xs text-green-600 dark:text-green-400">
                      ✓ Complete
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Estimated Time Remaining */}
      {progress > 0 && progress < 100 && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded border-l-4 border-blue-500">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            <span className="font-medium">Estimated time remaining:</span>
            {' '}
            {progress < 20 ? '2-3 minutes' : 
             progress < 60 ? '1-2 minutes' : 
             progress < 90 ? '30-60 seconds' : '10-20 seconds'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Processing time depends on video length and system performance
          </div>
        </div>
      )}

      {/* Completion Message */}
      {progress === 100 && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-green-800 dark:text-green-200">
                Video Processing Complete!
              </h4>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                Your video has been successfully processed for motion capture. You can now preview the results and export the animation data.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadProgress;