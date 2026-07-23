import { NextResponse } from "next/server";

import type { DomainError } from "@/application/errors";
import type { Result } from "@/application/result";

const ERROR_STATUS: Record<DomainError["code"], number> = {
  VALIDATION_ERROR: 422,
  NOT_FOUND: 404,
  STALE_WRITE: 409,
  STALE_TARGET: 409,
  STALE_ALTERNATIVE: 409,
  INVALID_REVIEW: 409,
  INVALID_ACCEPTANCE_UNIT: 422,
  GENERATION_CANCELLED: 409,
  GENERATION_FAILED: 500,
  INVALID_GENERATOR_OUTPUT: 422,
  PERSISTENCE_FAILURE: 500,
};

export function resultResponse<Value>(
  result: Result<Value, DomainError>,
): NextResponse {
  if (result.ok) {
    return NextResponse.json({ data: result.value });
  }

  return NextResponse.json(
    {
      error: {
        code: result.error.code,
        message: result.error.message,
        ...(result.error.details === undefined
          ? {}
          : { details: result.error.details }),
      },
    },
    { status: ERROR_STATUS[result.error.code] },
  );
}

export function invalidRequestResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "The request was not valid.",
      },
    },
    { status: 400 },
  );
}
