/**
 * Input, lookup and state failures of an operator service, raised after the caller passed the operator
 * gate (so a non-operator never learns whether a record exists). Policy denies and approval problems are
 * `OperatorAccessError`; this class covers everything an authorized operator can get wrong.
 */
export type OperatorServiceStatus = 400 | 404 | 409 | 422 | 502 | 503;

export class OperatorServiceError extends Error {
  constructor(
    readonly status: OperatorServiceStatus,
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "OperatorServiceError";
  }
}

export const operatorInvalid = (message: string) => new OperatorServiceError(400, "invalid_input", message);
export const operatorNotFound = (what: string) => new OperatorServiceError(404, "not_found", `${what} not found`);
export const operatorConflict = (code: string, message: string) => new OperatorServiceError(409, code, message);
