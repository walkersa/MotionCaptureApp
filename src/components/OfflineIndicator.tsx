import { useEffect, useState } from 'react';
import { offlineDetection } from '@/utils/offlineDetection';

const OfflineIndicator = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);

  useEffect(() => {
    const updateConnectionInfo = () => {
      const info = offlineDetection.getConnectionInfo();
      setConnectionInfo(info);
      setIsVisible(!info.isOnline);
    };

    // Initial check
    updateConnectionInfo();

    // Listen for connection changes
    const unsubscribe = offlineDetection.addListener((isOnline) => {
      setConnectionInfo(offlineDetection.getConnectionInfo());
      setIsVisible(!isOnline);
    });

    return unsubscribe;
  }, []);

  if (!isVisible) return null;

  return (
    <div className="offline-indicator">
      <div className="flex items-center space-x-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M12 2.18l.09-.09a2.25 2.25 0 0 1 3.182 0l.09.09a2.25 2.25 0 0 1 0 3.182l-.09.09a2.25 2.25 0 0 1-3.182 0l-.09-.09a2.25 2.25 0 0 1 0-3.182z" />
        </svg>
        <span>Working Offline</span>
        {connectionInfo?.effectiveType && (
          <span className="text-xs opacity-75">
            ({connectionInfo.effectiveType})
          </span>
        )}
      </div>
    </div>
  );
};

export default OfflineIndicator;