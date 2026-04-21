export type SchemaValidationIssue = {
  stage: "params" | "body" | "response";
  message: string;
  raw?: unknown;
};
