import { ValidationError } from "./errors";
import type { SchemaValidationIssue } from "./validation";

export interface Schema<T> {
  parse(input: unknown): T;
}

export type InferSchema<TSchema> = TSchema extends Schema<infer T> ? T : never;

export const schema = <T>(parser: (input: unknown) => T): Schema<T> => ({
  parse: parser
});

export const passthroughSchema = <T = unknown>(): Schema<T> =>
  schema((value) => value as T);

export const parseWithSchema = <T>(
  value: unknown,
  target: Schema<T> | undefined,
  routeName: string,
  stage: "params" | "body" | "response"
): T => {
  if (!target) {
    return value as T;
  }

  try {
    return target.parse(value);
  } catch (error) {
    const issue: SchemaValidationIssue = {
      stage,
      message: error instanceof Error ? error.message : "Schema parse failed",
      raw: error
    };

    throw new ValidationError(
      `Validation failed at ${stage}`,
      {
        routeName: routeName as never
      },
      issue
    );
  }
};
