// Native-free: the caller passes a random UUID and a SHA-256 hex function (expo-crypto in the app).

/** Raw nonce given to Firebase; only its SHA-256 goes to Apple, so a stolen token cannot be replayed. */
export function createRawNonce(uuid: string): string {
  return uuid.replace(/-/g, '');
}

export type Sha256Hex = (value: string) => Promise<string>;

export function hashNonce(rawNonce: string, sha256Hex: Sha256Hex): Promise<string> {
  return sha256Hex(rawNonce);
}
