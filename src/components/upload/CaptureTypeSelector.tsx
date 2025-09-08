import { CaptureType, CaptureTypeConfig } from '@/types/video';

interface CaptureTypeSelectorProps {
  selectedType: CaptureType | null;
  onSelectType: (type: CaptureType) => void;
  configs: CaptureTypeConfig[];
}

const CaptureTypeSelector = ({ 
  selectedType, 
  onSelectType, 
  configs 
}: CaptureTypeSelectorProps) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Select Motion Capture Type
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Choose the type of motion data you want to extract from your video
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {configs.map((config) => (
          <div
            key={config.id}
            className={`
              relative border-2 rounded-lg p-4 cursor-pointer transition-all duration-200
              hover:shadow-md hover:scale-[1.02]
              ${selectedType === config.id 
                ? `border-blue-500 bg-blue-50 dark:bg-blue-900/20` 
                : `border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500`
              }
            `}
            onClick={() => onSelectType(config.id)}
          >
            {/* Selection Indicator */}
            {selectedType === config.id && (
              <div className="absolute top-2 right-2">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            )}

            {/* Icon and Title */}
            <div className="flex items-center mb-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl mr-3"
                style={{ backgroundColor: `${config.color}20`, color: config.color }}
              >
                {config.icon}
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">
                  {config.displayName}
                </h4>
                <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>{config.landmarks} landmarks</span>
                  <span>{config.accuracy}% accuracy</span>
                  <span>{config.speed} FPS</span>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {config.description}
            </p>

            {/* Game Use Case */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-2">
              <p className="text-xs text-gray-700 dark:text-gray-300">
                <span className="font-medium">Game Use Cases:</span> {config.gameUseCase}
              </p>
            </div>

            {/* Performance Specs */}
            <div className="mt-3 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                  <span className="text-gray-600 dark:text-gray-400">Speed: {config.speed}fps</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
                  <span className="text-gray-600 dark:text-gray-400">RAM: {config.memoryRequirement}MB</span>
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-gray-500 dark:text-gray-400">
                  Confidence: {config.parameters.confidenceThreshold}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedType && (
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-500 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                {configs.find(c => c.id === selectedType)?.displayName} Selected
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                This capture type will extract{' '}
                <span className="font-medium">
                  {configs.find(c => c.id === selectedType)?.landmarks} landmarks
                </span>
                {' '}from your video for motion analysis. Processing will take approximately{' '}
                <span className="font-medium">
                  {Math.ceil((configs.find(c => c.id === selectedType)?.memoryRequirement || 40) / 10)} seconds
                </span>
                {' '}for a 10-second video.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CaptureTypeSelector;