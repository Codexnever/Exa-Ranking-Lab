import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export function CompareSetup({ queries, selectedQuery, setSelectedQuery, snapshot1, setSnapshot1, snapshot2, setSnapshot2, filteredSnapshots, formatDate }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gray-900 flex items-center gap-2">
          Compare Snapshots
        </CardTitle>
        <CardDescription>Choose two snapshots from the same query to analyze ranking changes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Query</label>
            <Select value={selectedQuery} onValueChange={setSelectedQuery}>
              <SelectTrigger>
                <SelectValue placeholder="Select a query" />
              </SelectTrigger>
              <SelectContent>
                {queries.map((query: any) => (
                  <SelectItem key={query.id} value={query.id}>
                    {query.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Baseline Snapshot</label>
            <Select value={snapshot1} onValueChange={setSnapshot1} disabled={!selectedQuery}>
              <SelectTrigger>
                <SelectValue placeholder="Select baseline" />
              </SelectTrigger>
              <SelectContent>
                {filteredSnapshots.map((snapshot: any) => (
                  <SelectItem key={snapshot.id} value={snapshot.id}>
                    {formatDate(snapshot.timestamp.toString())} - {snapshot.results.length} results
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Comparison Snapshot</label>
            <Select value={snapshot2} onValueChange={setSnapshot2} disabled={!selectedQuery}>
              <SelectTrigger>
                <SelectValue placeholder="Select comparison" />
              </SelectTrigger>
              <SelectContent>
                {filteredSnapshots.map((snapshot: any) => (
                  <SelectItem key={snapshot.id} value={snapshot.id}>
                    {formatDate(snapshot.timestamp.toString())} - {snapshot.results.length} results
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
