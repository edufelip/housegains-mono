import type { MessageRef } from './streak-rules';

/** A failed away-weeks save as a localized message reference, so screens translate it. */
export class AwayWeeksError extends Error {
  constructor(readonly ref: MessageRef) {
    super(ref.key);
    this.name = 'AwayWeeksError';
  }
}
