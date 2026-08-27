"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Loader2, Plus } from "lucide-react";
import { DatasetVersionCard } from "@/components/evaluation/DatasetVersionCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { evaluationApi } from "@/lib/evaluation-api";
import type { EvaluationDatasetDetail } from "@/types/evaluation";

export default function EvaluationPage() {
  const router = useRouter();
  const [items, setItems] = useState<EvaluationDatasetDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { datasets } = await evaluationApi.list();
      setItems(await Promise.all(datasets.map(d => evaluationApi.detail(d.id))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load evaluation datasets");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function create() {
    setCreating(true);
    setError("");
    try {
      const dataset = await evaluationApi.create({
        name,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      router.push(`/evaluation/${dataset.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create dataset");
    } finally {
      setCreating(false);
    }
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Target className="h-8 w-8 text-blue-600" />
          Evaluation
        </h1>
        <p className="text-muted-foreground">
          Controlled benchmark judgments are separate from operational Feedback.
        </p>
      </header>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Create benchmark dataset</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
          <Input
            aria-label="Dataset name"
            placeholder="Dataset name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <Textarea
            aria-label="Dataset description"
            placeholder="Optional description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="min-h-10"
          />
          <Button onClick={create} disabled={!name.trim() || creating}>
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create
          </Button>
        </CardContent>
      </Card>
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="sr-only">Loading datasets</span>
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="font-semibold">No evaluation datasets</h2>
            <p className="text-sm text-muted-foreground">
              Create a controlled benchmark above to begin.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map(item => (
            <DatasetVersionCard key={item.dataset.id} detail={item} />
          ))}
        </div>
      )}
    </div>
  );
}