"use client"

import { useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/lib/middleware/authentication/auth-context';
import { useConnectionHealth } from './ConnectionHealthProvider';

// Import your real-time hooks
import { useRealTimeQueries } from '@/monitoring/realtime/use-realtimeQuerie';
import { useRealTimeSnapshots } from '@/monitoring/realtime/use-realtimeSnapshot';
import { useRealTimeDrift } from '@/monitoring/realtime/use-realtimeDrift';
import { useRealTimeAnalytics } from '@/monitoring/realtime/use-realtimeAnalytics';

interface RealTimeProviderProps {
  children: ReactNode;
}

export function RealTimeProvider({ children }: RealTimeProviderProps) {
  const { user } = useAuth();
  const userId = user?.$id;
  const { recordActivity } = useConnectionHealth();
  const [subscriptionsReady, setSubscriptionsReady] = useState(false);

  // Initialize all real-time hooks
  useRealTimeQueries();
  useRealTimeSnapshots();
  useRealTimeDrift();
  useRealTimeAnalytics();

  useEffect(() => {
    if (userId) {
      // Mark subscriptions as ready after user is authenticated
      const timer = setTimeout(() => {
        setSubscriptionsReady(true);
        recordActivity('provider-init');
        console.log('[RealTimeProvider] Subscriptions initialized for user:', userId);
      }, 500);
      
      return () => clearTimeout(timer);
    } else {
      setSubscriptionsReady(false);
      console.log('[RealTimeProvider] User logged out, subscriptions disabled');
    }
  }, [userId, recordActivity]);

  // Optional: Show connection status indicator
  useEffect(() => {
    if (subscriptionsReady) {
      console.log('[RealTimeProvider] All real-time subscriptions are active');
    }
  }, [subscriptionsReady]);

  return (
    <>
      {children}
      
    </>
  );
}

// Default export for compatibility
export default RealTimeProvider;
