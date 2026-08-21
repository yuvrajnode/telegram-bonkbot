/**
 * Errors that carry a message safe to show a Telegram user verbatim.
 * Everything else is logged and replaced with a generic apology.
 */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export class InsufficientBalanceError extends UserFacingError {
  constructor(needed: string, available: string) {
    super(`Not enough SOL. Need ${needed}, wallet holds ${available}.`, 'Deposit and try again.');
    this.name = 'InsufficientBalanceError';
  }
}

export class RouteNotFoundError extends UserFacingError {
  constructor(mint: string) {
    super(`No route found for ${mint}.`, 'The pool may be too small or the token is not tradable.');
    this.name = 'RouteNotFoundError';
  }
}

export class TransactionFailedError extends UserFacingError {
  constructor(
    message: string,
    readonly signature?: string,
  ) {
    super(message);
    this.name = 'TransactionFailedError';
  }
}

export const isUserFacing = (err: unknown): err is UserFacingError =>
  err instanceof UserFacingError;
