import { Timestamp } from 'firebase-admin/firestore';
import { DomainError } from '../domain/errors';

// Request parsing and Firestore -> wire conversions shared by the admin callables.
// Bad input is always an `invalid-argument` DomainError, never a TypeError that surfaces as `internal`.

export function asObject(value: unknown, what = 'request'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DomainError('invalid-argument', `${what} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function requireString(data: Record<string, unknown>, field: string, maxLength = 200): string {
  const value = data[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('invalid-argument', `${field} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw new DomainError('invalid-argument', `${field} must be at most ${maxLength} characters.`);
  }
  return value;
}

export function requireInteger(data: Record<string, unknown>, field: string): number {
  const value = data[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DomainError('invalid-argument', `${field} must be an integer.`);
  }
  return value;
}

export function requirePositiveVersion(data: Record<string, unknown>, field = 'version'): number {
  const value = requireInteger(data, field);
  if (value < 1) throw new DomainError('invalid-argument', `${field} must be a positive integer.`);
  return value;
}

export function toIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

/** Like toIso for a field the writer always sets; a missing value reads as the epoch rather than failing a list. */
export function toIsoOrEpoch(value: unknown): string {
  return toIso(value) ?? new Date(0).toISOString();
}

export function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
