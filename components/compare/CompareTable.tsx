import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUp, ArrowDown, Minus, TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function getChangeIcon(change: string) {
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

function getChangeBadge(change: any) {
  switch (change.change) {
    case "moved_up":
      return (
        <Badge variant="default" className="bg-emerald-500">
          +{change.changeValue}
        </Badge>
      )
    case "moved_down":
      return <Badge variant="destructive">-{change.changeValue}</Badge>
    case "new":
      return (
        <Badge variant="default" className="bg-blue-500">
          New
        </Badge>
      )
    case "dropped":
      return <Badge variant="secondary">Dropped</Badge>
    default:
      return <Badge variant="outline">No Change</Badge>
  }
}

export function CompareTable({ comparison }: { comparison: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900">Ranking Changes</CardTitle>
        <CardDescription>Detailed breakdown of position changes between snapshots</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Previous Position</TableHead>
              <TableHead>Current Position</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comparison.map((change, index) => (
              <TableRow key={index}>
                <TableCell>
                  <div>
                    <p className="font-medium text-gray-900 truncate max-w-xs">{change.title}</p>
                    <p className="text-xs text-gray-500 truncate max-w-xs">{change.url}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium">
                    {change.previousPosition ? `#${change.previousPosition}` : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium">
                    {change.currentPosition ? `#${change.currentPosition}` : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getChangeIcon(change.change)}
                    {change.changeValue > 0 && (
                      <span className="text-sm text-gray-600">{change.changeValue} positions</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{getChangeBadge(change)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
