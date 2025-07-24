"use client"

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';

interface ConnectionMetrics {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  reconnectAttempts: number;
  lastEventType: string | null;
  averageResponseTime: number;
}

interface ConnectionHealthContextType {
  isHealthy: boolean;
  lastActivity: number;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
  recordActivity: (eventType?: string, responseTime?: number) => void;
  recordError: (error?: string) => void;
  recordReconnectAttempt: () => void;
  metrics: ConnectionMetrics;
  reconnectAttempts: number;
  successRate: number;
  averageResponseTime: number;
}

const ConnectionHealthContext = createContext<ConnectionHealthContextType | undefined>(undefined);

export function useConnectionHealth() {
  const context = useContext(ConnectionHealthContext);
  if (!context) {
    throw new Error('useConnectionHealth must be used within ConnectionHealthProvider');
  }
  return context;
}

interface ConnectionHealthProviderProps {
  children: ReactNode;
}

export function ConnectionHealthProvider({ children }: ConnectionHealthProviderProps) {
  const [isHealthy, setIsHealthy] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'disconnected'>('excellent');
  const [metrics, setMetrics] = useState<ConnectionMetrics>({
    totalEvents: 0,
    successfulEvents: 0,
    failedEvents: 0,
    reconnectAttempts: 0,
    lastEventType: null,
    averageResponseTime: 0,
  });

  const responseTimeRef = useRef<number[]>([]);

  const recordActivity = useCallback((eventType?: string, responseTime?: number) => {
    const now = Date.now();
    setLastActivity(now);
    
    // Record response time if provided
    if (responseTime) {
      responseTimeRef.current.push(responseTime);
      // Keep only last 10 response times
      if (responseTimeRef.current.length > 10) {
        responseTimeRef.current.shift();
      }
    }
    
    setMetrics(prev => ({
      ...prev,
      totalEvents: prev.totalEvents + 1,
      successfulEvents: prev.successfulEvents + 1,
      lastEventType: eventType || prev.lastEventType,
      averageResponseTime: responseTimeRef.current.length > 0 
        ? responseTimeRef.current.reduce((sum, time) => sum + time, 0) / responseTimeRef.current.length
        : prev.averageResponseTime,
    }));
    
    if (!isHealthy) {
      setIsHealthy(true);
      setConnectionQuality('excellent');
      setMetrics(prev => ({ ...prev, reconnectAttempts: 0 }));
    }
  }, [isHealthy]);

  const recordError = useCallback((error?: string) => {
    setMetrics(prev => ({
      ...prev,
      totalEvents: prev.totalEvents + 1,
      failedEvents: prev.failedEvents + 1,
    }));
    
    console.warn('[ConnectionHealth] Event failed:', error);
  }, []);

  const recordReconnectAttempt = useCallback(() => {
    setMetrics(prev => ({
      ...prev,
      reconnectAttempts: prev.reconnectAttempts + 1,
    }));
  }, []);

  // Health assessment based on multiple factors
  useEffect(() => {
    const assessHealth = () => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivity;
      
      // Determine quality based on activity and metrics
      let quality: 'excellent' | 'good' | 'poor' | 'disconnected';
      let healthy = true;
      
      if (timeSinceActivity < 30000) {
        quality = 'excellent';
      } else if (timeSinceActivity < 60000) {
        quality = 'good';
      } else if (timeSinceActivity < 120000) {
        quality = 'poor';
      } else {
        quality = 'disconnected';
        healthy = false;
      }
      
      // Factor in error rate
      const errorRate = metrics.totalEvents > 0 ? metrics.failedEvents / metrics.totalEvents : 0;
      if (errorRate > 0.3 && quality !== 'disconnected') { // > 30% error rate
        quality = 'poor';
      }
      
      // Factor in reconnection attempts
      if (metrics.reconnectAttempts > 3 && quality !== 'disconnected') {
        quality = 'poor';
      }
      
      setIsHealthy(healthy);
      setConnectionQuality(quality);
    };

    const interval = setInterval(assessHealth, 15000); // Check every 15 seconds
    assessHealth(); // Check immediately

    return () => clearInterval(interval);
  }, [lastActivity, metrics]);

  const value: ConnectionHealthContextType = {
    isHealthy,
    lastActivity,
    connectionQuality,
    recordActivity,
    recordError,
    recordReconnectAttempt,
    metrics,
    reconnectAttempts: metrics.reconnectAttempts,
    successRate: metrics.totalEvents > 0 ? Math.round((metrics.successfulEvents / metrics.totalEvents) * 100) : 100,
    averageResponseTime: Math.round(metrics.averageResponseTime),
  };

  return (
    <ConnectionHealthContext.Provider value={value}>
      {children}
    </ConnectionHealthContext.Provider>
  );
}

// Default export for compatibility
export default ConnectionHealthProvider;
