import { useState } from 'react';
import { useAppState } from '@/stores/appState';
import { DatabaseService } from '@/stores/database';

const Header = () => {
  const { currentProject, userPreferences, updatePreferences, clearProject } = useAppState();
  const [storageInfo, setStorageInfo] = useState<{ used: number; available: number } | null>(null);

  // Load storage info on mount
  useState(() => {
    DatabaseService.getStorageUsage().then(setStorageInfo);
  });

  const handleThemeToggle = () => {
    const newTheme = userPreferences.theme === 'light' ? 'dark' : 
                    userPreferences.theme === 'dark' ? 'system' : 'light';
    updatePreferences({ theme: newTheme });
    
    // Apply theme to document
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (newTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System theme
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', isDark);
    }
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Title */}
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">MC</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                Motion Capture Pro
              </h1>
              {currentProject && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {currentProject.name}
                </p>
              )}
            </div>
          </div>

          {/* Status and Actions */}
          <div className="flex items-center space-x-4">
            {/* Storage Usage */}
            {storageInfo && (
              <div className="hidden md:flex items-center text-sm text-gray-600 dark:text-gray-400">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                {formatBytes(storageInfo.used)} used
              </div>
            )}

            {/* Offline Status */}
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${
                navigator.onLine ? 'bg-green-500' : 'bg-yellow-500'
              }`}></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {navigator.onLine ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={handleThemeToggle}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              aria-label="Toggle theme"
            >
              {userPreferences.theme === 'light' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : userPreferences.theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )}
            </button>

            {/* Project Actions */}
            {currentProject && (
              <button
                onClick={clearProject}
                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Back to Projects
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;