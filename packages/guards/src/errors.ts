export class DailyCapExceededError extends Error {
  constructor(accountId: string, actionType: string) {
    super(`Daily cap exceeded for account ${accountId}, action: ${actionType}`);
    this.name = "DailyCapExceededError";
  }
}

export class WarmUpError extends Error {
  constructor(accountId: string, actionType: string, phase: string) {
    super(
      `Account ${accountId} in warm-up phase ${phase} cannot perform: ${actionType}`
    );
    this.name = "WarmUpError";
  }
}

export class AnomalyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnomalyError";
  }
}

export class AccountPausedError extends Error {
  constructor(accountId: string) {
    super(`Account ${accountId} is paused`);
    this.name = "AccountPausedError";
  }
}

export class MessageBodyDedupError extends Error {
  constructor(bodyHash: string) {
    super(
      `Message body (hash: ${bodyHash}) has already been sent to 3 people today — blocked to prevent spam signal`
    );
    this.name = "MessageBodyDedupError";
  }
}

export class IpMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(
      `Proxy IP mismatch — expected ${expected}, got ${actual}. Session killed to prevent location inconsistency.`
    );
    this.name = "IpMismatchError";
  }
}
