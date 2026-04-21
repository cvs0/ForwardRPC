import type { ZodTypeAny } from "zod";
import { schema, type Schema } from "./schema";

export const fromZod = <TZod extends ZodTypeAny>(zodSchema: TZod): Schema<ReturnType<TZod["parse"]>> =>
  schema((input: unknown) => zodSchema.parse(input));
