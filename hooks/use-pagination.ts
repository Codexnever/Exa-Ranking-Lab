// hooks/use-pagination.ts
import { useState, useMemo, useCallback } from 'react'

interface UsePaginationProps {
  data: any[]
  initialItemsPerPage?: number
  resetPageOnDataChange?: boolean
}

export function usePagination<T>({ 
  data, 
  initialItemsPerPage = 10,
  resetPageOnDataChange = true 
}: UsePaginationProps & { data: T[] }) {
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(initialItemsPerPage)

  // Calculate pagination values
  const totalItems = data.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage

  // Get current page data
  const currentPageData = useMemo(() => {
    return data.slice(startIndex, endIndex)
  }, [data, startIndex, endIndex])

  // Reset to first page when data changes
  const prevDataLength = useMemo(() => data.length, [data.length])
  
  if (resetPageOnDataChange && prevDataLength !== totalItems && currentPage > 1) {
    setCurrentPage(1)
  }

  // Navigation functions
  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }, [totalPages])

  const goToNextPage = useCallback(() => {
    goToPage(currentPage + 1)
  }, [currentPage, goToPage])

  const goToPrevPage = useCallback(() => {
    goToPage(currentPage - 1)
  }, [currentPage, goToPage])

  const changeItemsPerPage = useCallback((newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1) // Reset to first page
  }, [])

  // Generate page numbers for pagination controls
  const getPageNumbers = useCallback(() => {
    const pages = []
    const maxVisiblePages = 5
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      const start = Math.max(1, currentPage - 2)
      const end = Math.min(totalPages, currentPage + 2)
      
      if (start > 1) {
        pages.push(1)
        if (start > 2) pages.push('...')
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }
      
      if (end < totalPages) {
        if (end < totalPages - 1) pages.push('...')
        pages.push(totalPages)
      }
    }
    
    return pages
  }, [currentPage, totalPages])

  return {
    // Data
    currentPageData,
    
    // Pagination state
    currentPage,
    totalPages,
    itemsPerPage,
    totalItems,
    startIndex,
    endIndex,
    
    // Navigation
    goToPage,
    goToNextPage,
    goToPrevPage,
    changeItemsPerPage,
    
    // Helpers
    getPageNumbers,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
    
    // Direct setters (if needed)
    setCurrentPage,
    setItemsPerPage,
  }
}
