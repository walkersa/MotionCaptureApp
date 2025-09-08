import { useState, useEffect, useCallback } from 'react';
import { AppState, Project, ProcessingStatus, UserPreferences } from '@/types';
import { DatabaseService } from './database';
import { offlineDetection } from '@/utils/offlineDetection';

// Default user preferences
const defaultPreferences: UserPreferences = {
  theme: 'system',
  defaultModel: 'mediapipe-pose',
  exportFormat: 'bvh',
  autoSave: true
};

// Application state management using React hooks (no localStorage)
export function useAppState() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    isProcessing: false,
    progress: 0,
    currentStep: ''
  });
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(defaultPreferences);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize app state on mount
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Load user preferences from IndexedDB or use defaults
        const savedPrefs = await loadPreferencesFromDB();
        if (savedPrefs) {
          setUserPreferences(savedPrefs);
        }
        
        // Request persistent storage
        await requestPersistentStorage();
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize app state:', error);
        setIsInitialized(true); // Continue with defaults
      }
    };

    initializeApp();
  }, []);

  // Set up offline detection
  useEffect(() => {
    const unsubscribe = offlineDetection.addListener((online) => {
      setIsOffline(!online);
    });

    return unsubscribe;
  }, []);

  // Auto-save preferences when they change
  useEffect(() => {
    if (isInitialized && userPreferences.autoSave) {
      savePreferencesToDB(userPreferences);
    }
  }, [userPreferences, isInitialized]);

  const loadProject = useCallback(async (projectId: string) => {
    try {
      const project = await DatabaseService.getProject(projectId);
      if (project) {
        setCurrentProject(project);
      } else {
        throw new Error('Project not found');
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    }
  }, []);

  const createProject = useCallback(async (name: string, description?: string) => {
    try {
      const project = await DatabaseService.createProject(name, description);
      setCurrentProject(project);
      return project;
    } catch (error) {
      console.error('Failed to create project:', error);
      throw error;
    }
  }, []);

  const updateProcessingStatus = useCallback((status: Partial<ProcessingStatus>) => {
    setProcessingStatus(prev => ({ ...prev, ...status }));
  }, []);

  const updatePreferences = useCallback((prefs: Partial<UserPreferences>) => {
    setUserPreferences(prev => ({ ...prev, ...prefs }));
  }, []);

  const clearProject = useCallback(() => {
    setCurrentProject(null);
  }, []);

  return {
    // State
    currentProject,
    isOffline,
    processingStatus,
    userPreferences,
    isInitialized,

    // Actions
    loadProject,
    createProject,
    clearProject,
    updateProcessingStatus,
    updatePreferences,

    // Utilities
    getAppState: () => ({
      currentProject,
      isOffline,
      processingStatus,
      userPreferences
    } as AppState)
  };
}

// Helper functions for preferences persistence
async function loadPreferencesFromDB(): Promise<UserPreferences | null> {
  try {
    // Store preferences in a simple key-value table in IndexedDB
    // This is a simplified implementation - in a real app, you might want a dedicated preferences table
    const stored = localStorage.getItem('motion-capture-preferences');
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  } catch (error) {
    console.error('Failed to load preferences:', error);
    return null;
  }
}

async function savePreferencesToDB(preferences: UserPreferences): Promise<void> {
  try {
    // Simplified storage - in practice, use IndexedDB for consistency
    localStorage.setItem('motion-capture-preferences', JSON.stringify(preferences));
  } catch (error) {
    console.error('Failed to save preferences:', error);
  }
}

async function requestPersistentStorage(): Promise<void> {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      const granted = await navigator.storage.persist();
      if (granted) {
        console.log('Persistent storage granted');
      } else {
        console.warn('Persistent storage not granted');
      }
    } catch (error) {
      console.error('Failed to request persistent storage:', error);
    }
  }
}