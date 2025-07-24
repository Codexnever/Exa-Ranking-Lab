"use client"

import { useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/lib/contexts/auth-context';
import { useConnectionHealth } from './ConnectionHealthProvider';

// Import your real-time hooks
import { useRealTimeQueries } from '@/hooks/use-realtimeQuerie';
import { useRealTimeSnapshots } from '@/hooks/use-realtimeSnapshot';
import { useRealTimeDrift } from '@/hooks/use-realtimeDrift';
import { useRealTimeAnalytics } from '@/hooks/use-realtimeAnalytics';

interface RealTimeProviderProps {
  children: ReactNode;
}

export function RealTimeProvider({ children }: RealTimeProviderProps) {
  const { user } = useAuth();
  const { recordActivity } = useConnectionHealth();
  const [subscriptionsReady, setSubscriptionsReady] = useState(false);

  // Initialize all real-time hooks
  useRealTimeQueries();
  useRealTimeSnapshots();
  useRealTimeDrift();
  useRealTimeAnalytics();

  useEffect(() => {
    if (user) {
      // Mark subscriptions as ready after user is authenticated
      const timer = setTimeout(() => {
        setSubscriptionsReady(true);
        recordActivity('provider-init');
        console.log('[RealTimeProvider] Subscriptions initialized for user:', user.$id);
      }, 500);
      
      return () => clearTimeout(timer);
    } else {
      setSubscriptionsReady(false);
      console.log('[RealTimeProvider] User logged out, subscriptions disabled');
    }
  }, [user, recordActivity]);

  // Optional: Show connection status indicator
  useEffect(() => {
    if (subscriptionsReady) {
      console.log('[RealTimeProvider] All real-time subscriptions are active');
    }
  }, [subscriptionsReady]);

  return (
    <>
      {children}
      
      {/* Optional: Global Connection Status Indicator (bottom right) */}
      {user && (
        <div className="fixed bottom-4 right-4 z-40">
          <div
            className={`h-3 w-3 rounded-full transition-all duration-300 shadow-lg ${
              subscriptionsReady
                ? 'bg-green-500 shadow-green-500/50'
                : 'bg-gray-400 shadow-gray-400/50'
            }`}
            title={
              subscriptionsReady
                ? 'Real-time connections active'
                : 'Establishing connections...'
            }
          >
            {subscriptionsReady && (
              <div className="absolute inset-0 h-3 w-3 rounded-full bg-green-500 animate-ping opacity-75" />
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Default export for compatibility
export default RealTimeProvider;
