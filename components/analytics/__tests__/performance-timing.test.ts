import { Children, isValidElement, type ReactNode } from 'react'
import { PerformanceCharts } from '../PerformanceCharts'

test('performance tooltip display names format milliseconds rather than percentages', () => {
  const formatters: Array<(value: number, name: string) => string> = []
  function visit(node: ReactNode): void {
    Children.forEach(node, child => {
      if (!isValidElement<{ children?: ReactNode; formatter?: (value: number, name: string) => string }>(child)) return
      if (child.props.formatter) formatters.push(child.props.formatter)
      visit(child.props.children)
    })
  }
  visit(PerformanceCharts({ performanceData: [{ hour: '12', responseTime: 2000 }], successRateByHour: [{ hour: '12', avgTime: 2000 }] }))
  expect(formatters).toHaveLength(2)
  expect(formatters[0](2000, 'Response Time')).toBe('2.00s')
  expect(formatters[1](2000, 'Avg Response Time')).toBe('2.00s')
  expect(formatters[0](75, 'Success Rate')).toBe('75%')
})
