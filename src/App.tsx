import { useEffect, useState } from 'react';
import { useAppState } from '@/stores/appState';
import { DatabaseService } from '@/stores/database';
import { offlineDetection } from '@/utils/offlineDetection';
import Header from '@/components/Header';
import ProjectManager from '@/components/project/ProjectManager';
import MainWorkspace from '@/components/MainWorkspace';
import OfflineIndicator from '@/components/OfflineIndicator';

function App() {
  const {
    currentProject,
    isOffline,
    isInitialized,
    createProject,
    loadProject
  } = useAppState();
  
  const [isLoading, setIsLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);

  // Initialize app and load projects
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Wait for app state to initialize
        if (!isInitialized) return;
        
        // Load existing projects
        const existingProjects = await DatabaseService.getProjects();
        setProjects(existingProjects);
        
        // Auto-create a default project if none exist
        if (existingProjects.length === 0) {
          const defaultProject = await createProject(
            'My First Motion Capture Project',
            'Default project for getting started with motion capture'
          );
          setProjects([defaultProject]);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setIsLoading(false);
      }
    };

    initializeApp();
  }, [isInitialized, createProject]);

  // Show loading screen while initializing
  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="spinner mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Initializing Motion Capture System
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Setting up offline capabilities and loading projects...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        {!currentProject ? (
          <ProjectManager
            projects={projects}
            onSelectProject={loadProject}
            onCreateProject={createProject}
            onRefreshProjects={async () => {
              const refreshedProjects = await DatabaseService.getProjects();
              setProjects(refreshedProjects);
            }}
          />
        ) : (
          <MainWorkspace project={currentProject} />
        )}
      </main>

      {/* Offline Indicator */}
      {isOffline && <OfflineIndicator />}

      {/* PWA Install Prompt would go here */}
    </div>
  );
}

export default App;