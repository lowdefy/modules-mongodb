// Local mirror of @lowdefy/errors UserError. Discriminated by runRoutine on
// `name === 'UserError'` and `isReject` — not `instanceof`.
export default class UserError extends Error {
  constructor(message, { isReject = false } = {}) {
    super(message);
    this.name = "UserError";
    this.isReject = isReject;
  }
}
