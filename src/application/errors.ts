export const DOMAIN_ERROR_CODES = [
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "STALE_WRITE",
  "STALE_TARGET",
  "STALE_ALTERNATIVE",
  "INVALID_REVIEW",
  "INVALID_ACCEPTANCE_UNIT",
  "PERSISTENCE_FAILURE",
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export type DomainError<
  Code extends DomainErrorCode = DomainErrorCode,
  Details = unknown,
> = Readonly<{
  code: Code;
  message: string;
  details?: Details;
}>;

export function domainError<Code extends DomainErrorCode>(
  code: Code,
  message: string,
): DomainError<Code, undefined>;
export function domainError<Code extends DomainErrorCode, Details>(
  code: Code,
  message: string,
  details: Details,
): DomainError<Code, Details>;
export function domainError<Code extends DomainErrorCode>(
  code: Code,
  message: string,
  details?: unknown,
): DomainError<Code> {
  return {
    code,
    message,
    ...(details === undefined ? {} : { details }),
  };
}
