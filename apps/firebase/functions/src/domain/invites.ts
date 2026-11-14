import { randomInt } from 'node:crypto';

// Ported from household-client.ts (invite codes) and the removed server's createInviteCode.

export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_MAX_USES = 8;
export const MAX_HOUSEHOLD_MEMBERS = 12;

export function normalizeInviteCode(code: unknown): string {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

export function isValidInviteCode(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code);
}

export function createInviteCode(randomIndex: (length: number) => number = (n) => randomInt(n)): string {
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += INVITE_ALPHABET[randomIndex(INVITE_ALPHABET.length)];
  }
  return code;
}

export type InviteProblem = 'revoked' | 'expired' | 'full';

export function inviteProblem(
  invite: { revoked: boolean; expiresAt: Date; uses: number; maxUses: number },
  now: Date,
): InviteProblem | null {
  if (invite.revoked) return 'revoked';
  if (invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (invite.uses >= invite.maxUses) return 'full';
  return null;
}
