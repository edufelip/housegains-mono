/** Error codes mirror the HttpsError codes the contract uses. */
export type ErrorCode =
  | 'invalid-argument'
  | 'not-found'
  | 'permission-denied'
  | 'failed-precondition'
  | 'already-exists'
  | 'resource-exhausted'
  | 'unauthenticated';

/** Thrown by pure domain code; the callable boundary maps it to an HttpsError. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
