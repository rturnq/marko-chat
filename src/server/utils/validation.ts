import type { StandardSchemaV1 } from "@standard-schema/spec";

export interface FormError {
  message: string;
  fields: Record<string, string> | undefined;
}

export function formError(
  error: Error | string | unknown,
  issues?: readonly StandardSchemaV1.Issue[],
): FormError {
  return {
    message:
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Unknown error",
    fields: issues ? flattenIssues(issues) : undefined,
  };
}

export function flattenIssues(issues: readonly StandardSchemaV1.Issue[]) {
  let errors: Record<string, string> | undefined;
  for (const issue of issues) {
    const field = getIssueField(issue);
    if (field) {
      (errors ??= {})[field] = issue.message;
    }
  }
  return errors;
}

function getIssueField(issue: StandardSchemaV1.Issue) {
  let path = "";
  let sep = "";
  if (issue.path) {
    for (const segment of issue.path) {
      let key = typeof segment === "object" ? segment.key : segment;
      if (typeof key === "string") {
        path += sep;
        path += key;
        sep = "."
      }
    }
  }
  return path;
}
