export type EvaluationErrorCode =
  | "INVALID_INPUT" | "UNAUTHORIZED" | "NOT_FOUND" | "DATASET_NOT_DRAFT"
  | "DATASET_NOT_FROZEN" | "CONFLICT" | "STORAGE_ERROR" | "SCHEMA_ERROR"

export class EvaluationError extends Error {
  constructor(public readonly code: EvaluationErrorCode, message: string, public readonly status: number) {
    super(message)
    this.name = "EvaluationError"
  }
}
export const invalid = (message: string) => new EvaluationError("INVALID_INPUT", message, 400)
