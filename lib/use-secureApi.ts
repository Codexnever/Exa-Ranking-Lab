import { useState, useCallback } from 'react'
import { apiClient } from '@/lib/api/secure-client'
import { toast } from 'sonner'

interface UseSecureApiOptions {
  showErrorToast?: boolean
  showSuccessToast?: boolean
  successMessage?: string
}

export function useSecureApi(options: UseSecureApiOptions = {}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const call = useCallback(async <TData = any, TResponse = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: TData
  ): Promise<TResponse> => {
    setLoading(true)
    setError(null)

    try {
      let result: TResponse

      // Enhanced method handling with better type safety
      switch (method) {
        case 'GET':
          result = await apiClient.get<TResponse>(endpoint)
          break
        case 'POST':
          result = await apiClient.post<TResponse>(endpoint, data)
          break
        case 'PUT':
          result = await apiClient.put<TResponse>(endpoint, data)
          break
        case 'DELETE':
          result = await apiClient.delete<TResponse>(endpoint)
          break
        default:
          throw new Error(`Unsupported HTTP method: ${method}`)
      }

      // Show success toast if configured
      if (options.showSuccessToast && options.successMessage) {
        toast.success(options.successMessage)
      }

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      
      // Show error toast if configured
      if (options.showErrorToast !== false) {
        toast.error(errorMessage)
      }
      
      throw err
    } finally {
      setLoading(false)
    }
  }, [options])

  // Additional utility methods for common operations
  const get = useCallback(<T = any>(endpoint: string) => 
    call<undefined, T>('GET', endpoint), [call])
  
  const post = useCallback(<TData = any, TResponse = any>(endpoint: string, data?: TData) => 
    call<TData, TResponse>('POST', endpoint, data), [call])
  
  const put = useCallback(<TData = any, TResponse = any>(endpoint: string, data?: TData) => 
    call<TData, TResponse>('PUT', endpoint, data), [call])
  
  const del = useCallback(<TResponse = any>(endpoint: string) => 
    call<undefined, TResponse>('DELETE', endpoint), [call])

  return { 
    call, 
    get, 
    post, 
    put, 
    delete: del,
    loading, 
    error,
    clearError: () => setError(null)
  }
}
