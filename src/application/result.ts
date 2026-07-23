import type { DomainError } from "./errors";

export type Result<
  Value,
  Error extends DomainError<DomainError["code"], unknown> = DomainError,
> =
  Readonly<{ ok: true; value: Value }> | Readonly<{ ok: false; error: Error }>;

export function ok<Value>(value: Value): Result<Value, never> {
  return { ok: true, value };
}

export function err<Error extends DomainError<DomainError["code"], unknown>>(
  error: Error,
): Result<never, Error> {
  return { ok: false, error };
}
