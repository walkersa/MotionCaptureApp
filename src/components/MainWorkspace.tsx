import { useState, useEffect } from 'react';
import { Project, Session } from '@/types';
import { ProcessedVideo } from '@/types/video';
import { DatabaseService } from '@/stores/database';
import VideoUpload from './upload/VideoUpload';
import BatchVideoUpload from './upload/BatchVideoUpload';

interface MainWorkspaceProps {
  project: Project;
}

const MainWorkspace = ({ project }: MainWorkspaceProps) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [processedVideos, setProcessedVideos] = useState<ProcessedVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upload' | 'batch' | 'preview' | 'export' | 'sessions'>('upload');

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load sessions and processed videos
        const loadedProcessedVideos = await DatabaseService.getProcessedVideos({ limit: 20 });
        setProcessedVideos(loadedProcessedVideos);
        setSessions([]);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load workspace data:', error);
        setIsLoading(false);
      }
    };

    loadData();
  }, [project.id]);

  const handleVideoProcessed = async (processedVideo: ProcessedVideo) => {
    try {
      // Store in database
      await DatabaseService.storeProcessedVideo(processedVideo);
      // Update local state
      setProcessedVideos(prev => [processedVideo, ...prev]);
    } catch (error) {
      console.error('Failed to store processed video:', error);
    }
  };

  const handleBatchProcessed = async (processedVideos: ProcessedVideo[]) => {
    try {
      // Store all in database
      for (const video of processedVideos) {
        await DatabaseService.storeProcessedVideo(video);
      }
      // Update local state
      setProcessedVideos(prev => [...processedVideos, ...prev]);
    } catch (error) {
      console.error('Failed to store batch processed videos:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading project workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Project Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {project.name}
        </h2>
        {project.description && (
          <p className="text-gray-600 dark:text-gray-400">
            {project.description}
          </p>
        )}
      </div>

      {/* Workspace Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button 
            onClick={() => setActiveTab('upload')}
            className={`border-b-2 py-2 px-1 text-sm font-medium ${
              activeTab === 'upload'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Single Upload
          </button>
          <button 
            onClick={() => setActiveTab('batch')}
            className={`border-b-2 py-2 px-1 text-sm font-medium ${
              activeTab === 'batch'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Batch Upload
          </button>
          <button 
            onClick={() => setActiveTab('preview')}
            className={`border-b-2 py-2 px-1 text-sm font-medium ${
              activeTab === 'preview'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            3D Preview
          </button>
          <button 
            onClick={() => setActiveTab('export')}
            className={`border-b-2 py-2 px-1 text-sm font-medium ${
              activeTab === 'export'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Export
          </button>
          <button 
            onClick={() => setActiveTab('sessions')}
            className={`border-b-2 py-2 px-1 text-sm font-medium ${
              activeTab === 'sessions'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Sessions ({processedVideos.length})
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-96">
        {activeTab === 'upload' && (
          <VideoUpload onVideoProcessed={handleVideoProcessed} />
        )}
        
        {activeTab === 'batch' && (
          <BatchVideoUpload onVideosProcessed={handleBatchProcessed} />
        )}
        
        {activeTab === 'preview' && (
          <div className="text-center py-12">
            <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-9-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              3D Preview Coming Soon
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Upload and process a video to see the 3D motion capture preview
            </p>
          </div>
        )}
        
        {activeTab === 'export' && (
          <div className="text-center py-12">
            <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Export System Coming Soon
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Export your motion capture data to BVH, FBX, and other formats
            </p>
          </div>
        )}
        
        {activeTab === 'sessions' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Processed Videos
              </h3>
              {processedVideos.length > 0 && (
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {processedVideos.length} video{processedVideos.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            
            {processedVideos.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                  <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No videos processed yet
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Upload and process videos to see them here
                </p>
                <button
                  onClick={() => setActiveTab('upload')}
                  className="btn btn-primary"
                >
                  Upload Your First Video
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {processedVideos.map((video) => (
                  <div
                    key={video.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                  >
                    <div className="aspect-video bg-gray-100 dark:bg-gray-700 relative">
                      <img
                        src={URL.createObjectURL(video.thumbnail)}
                        alt={`Thumbnail for ${video.originalFile.name}`}
                        className="w-full h-full object-cover"
                        onLoad={(e) => {
                          // Clean up object URL to prevent memory leaks
                          setTimeout(() => {
                            URL.revokeObjectURL(e.currentTarget.src);
                          }, 1000);
                        }}
                      />
                      <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                        {video.captureType.charAt(0).toUpperCase() + video.captureType.slice(1)}
                      </div>
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                        {video.frames.length} frames
                      </div>
                    </div>
                    
                    <div className="p-4">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate mb-1">
                        {video.originalFile.name}
                      </h4>
                      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                        <div>
                          {(video.originalFile.size / (1024 * 1024)).toFixed(1)} MB • {video.metadata.duration.toFixed(1)}s
                        </div>
                        <div>
                          {video.metadata.width} × {video.metadata.height} • {video.metadata.fps} fps
                        </div>
                        <div>
                          Processed {new Date(video.processedAt).toLocaleDateString()}
                        </div>
                      </div>
                      
                      <div className="mt-3 flex items-center justify-between">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          video.status === 'completed' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                        }`}>
                          {video.status}
                        </span>
                        <div className="flex space-x-1">
                          <button className="text-gray-400 hover:text-blue-500 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button className="text-gray-400 hover:text-green-500 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sidebar - Only show on main tabs */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"></div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Project Stats */}
          <div className="card">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Project Stats</h4>
            <dl className="space-y-2">
              <div className="flex justify-between text-sm">
                <dt className="text-gray-500 dark:text-gray-400">Sessions</dt>
                <dd className="text-gray-900 dark:text-white font-medium">{sessions.length}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-gray-500 dark:text-gray-400">Created</dt>
                <dd className="text-gray-900 dark:text-white font-medium">
                  {new Date(project.createdAt).toLocaleDateString()}
                </dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-gray-500 dark:text-gray-400">Last Updated</dt>
                <dd className="text-gray-900 dark:text-white font-medium">
                  {new Date(project.updatedAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <button className="w-full btn btn-secondary text-left justify-start">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                Import from Blender
              </button>
              <button className="w-full btn btn-secondary text-left justify-start">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Model Settings
              </button>
              <button className="w-full btn btn-secondary text-left justify-start">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Export All
              </button>
            </div>
          </div>

          {/* System Status */}
          <div className="card">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">System Status</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Offline Mode</span>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm text-green-600 dark:text-green-400">Active</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">AI Models</span>
                <span className="text-sm text-gray-900 dark:text-white">Ready</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">WebAssembly</span>
                <span className="text-sm text-gray-900 dark:text-white">Supported</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainWorkspace;