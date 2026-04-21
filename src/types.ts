export type Brand<T, TBrand extends string> = T & {
  readonly __brand: TBrand;
};

export type Dictionary<T = unknown> = Record<string, T>;

export type MaybePromise<T> = T | Promise<T>;

export type Primitive = string | number | boolean | null | undefined;

export type DeepReadonly<T> = T extends Primitive
  ? T
  : T extends Array<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : { readonly [K in keyof T]: DeepReadonly<T[K]> };

export type Merge<A, B> = Omit<A, keyof B> & B;

export type IsNever<T> = [T] extends [never] ? true : false;
