const INVITE_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

export function extractInviteCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (INVITE_CODE.test(normalized)) return normalized;

  try {
    const url = new URL(normalized);
    if (url.hostname !== 'housegains.app') return null;
    const match = /^\/(?:J|JOIN)\/([A-HJ-NP-Z2-9]{6})$/i.exec(url.pathname);
    return match?.[1]?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}
