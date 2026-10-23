// Local mirror of @lowdefy/errors UserError. Discriminated by runRoutine on
// `name === 'UserError'` and `isReject` — not `instanceof`. `isLowdefyError`
// lets it pass the request resolver boundary unwrapped, so a reject reaches the
// browser with its message instead of a generic request error.
export default class UserError extends Error {
  constructor(message, { isReject = false } = {}) {
    super(message);
    this.name = "UserError";
    this.isLowdefyError = true;
    this.isReject = isReject;
  }
}
