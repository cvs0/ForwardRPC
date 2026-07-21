import { schema, type Schema } from "./schema";

/** Minimal Zod-compatible surface so fromZod works with Zod 3 and 4. */
type ZodLikeSchema<T> = {
  parse(input: unknown): T;
};

export const fromZod = <T>(zodSchema: ZodLikeSchema<T>): Schema<T> =>
  schema((input: unknown) => zodSchema.parse(input));
