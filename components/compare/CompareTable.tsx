import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ArrowUp, ArrowDown, TrendingUp, TrendingDown, Minus } from "lucide-react"
import type { RankingChange } from "@/lib/type"

const getChangeIcon = (change: RankingChange["change"]) => {
  switch (change) {
    case "moved_up":
      return <ArrowUp className="w-4 h-4 text-emerald-500" />
    case "moved_down":
      return <ArrowDown className="w-4 h-4 text-red-500" />
    case "new":
      return <TrendingUp className="w-4 h-4 text-blue-500" />
    case "dropped":
      return <TrendingDown className="w-4 h-4 text-gray-500" />
    default:
      return <Minus className="w-4 h-4 text-gray-400" />
  }
}

const getChangeBadge = (change: RankingChange) => {
  switch (change.change) {
    case "moved_up":
      return <Badge className="bg-emerald-500">+{change.changeValue}</Badge>
    case "moved_down":
      return <Badge variant="destructive">-{change.changeValue}</Badge>
    case "new":
      return <Badge className="bg-blue-500">New</Badge>
    case "dropped":
      return <Badge variant="secondary">Dropped</Badge>
    default:
      return <Badge variant="outline">No Change</Badge>
  }
}

export function CompareTable({ comparison }: { comparison: RankingChange[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>URL</TableHead>
            <TableHead>Previous</TableHead>
            <TableHead>Current</TableHead>
            <TableHead>Change</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comparison.map((change, idx) => (
            <TableRow key={idx}>
              <TableCell>
                <div>
                  <p className="font-medium text-gray-900 truncate max-w-xs">{change.title}</p>
                  <p className="text-xs text-gray-500 truncate max-w-xs">{change.url}</p>
                </div>
              </TableCell>
              <TableCell>{change.previousPosition ? `#${change.previousPosition}` : "—"}</TableCell>
              <TableCell>{change.currentPosition ? `#${change.currentPosition}` : "—"}</TableCell>
              <TableCell className="flex items-center gap-2">
                {getChangeIcon(change.change)}
                {change.changeValue > 0 && (
                  <span className="text-sm text-gray-600">{change.changeValue} positions</span>
                )}
              </TableCell>
              <TableCell>{getChangeBadge(change)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
