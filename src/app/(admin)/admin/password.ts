// Random passwords handed over by an admin. Client and server safe (Web Crypto).
// No look-alike characters (0/O, 1/l/I) so the password survives being read aloud or copied by hand.
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const GENERATED_LENGTH = 12;

export function randomPassword(length = GENERATED_LENGTH): string {
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

/** Lowercase letters, digits, dot, underscore, dash; 3–32 characters. */
export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
