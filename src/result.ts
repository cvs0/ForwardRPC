export type Ok<T> = {
  ok: true;
  data: T;
};

export type Err<E> = {
  ok: false;
  error: E;
};

export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });

export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(value: Result<T, E>): value is Ok<T> => value.ok;

export const isErr = <T, E>(value: Result<T, E>): value is Err<E> => !value.ok;

export const mapResult = <T, E, U>(
  value: Result<T, E>,
  mapper: (input: T) => U
): Result<U, E> => {
  if (!value.ok) {
    return value;
  }
  return ok(mapper(value.data));
};
