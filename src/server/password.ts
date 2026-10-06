import { Buffer } from "node:buffer";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/*
 * scrypt, from node:crypto, which Cloudflare Workers implement natively as
 * well as Node. Each hash gets a random 16-byte salt, and is stored in the
 * PHC string form (`$scrypt$ln=…,r=…,p=…$salt$hash`), which carries its salt
 * and settings, so they can be raised later without breaking stored hashes.
 *
 * N = 2^12 with r = 8: 4 MiB of memory, a 32nd of OWASP's baseline
 * (N = 2^17), for now, so a hash takes about 5ms and fits in the 10ms of CPU
 * a request gets on Workers' free plan. The 8-character minimum password
 * makes up some of the difference. Raise `ln` on a paid plan, up to 16:
 * past that, a hash needs more memory than a Worker has.
 */
const SETTINGS: Settings = { ln: 12, r: 8, p: 1 };
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

interface Settings {
  /** log2 of N, the CPU and memory cost */
  ln: number;
  /** The block size */
  r: number;
  /** The parallelism */
  p: number;
}

const ENCODED =
  /^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

// The same password typed with composed or decomposed characters matches.
function normalize(password: string) {
  return password.normalize("NFKC");
}

function derive(password: string, salt: Buffer, { ln, r, p }: Settings) {
  const N = 2 ** ln;
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      normalize(password),
      salt,
      KEY_LENGTH,
      // A hash takes 128·N·r bytes; past 32 MiB, scrypt wants it allowed.
      { N, r, p, maxmem: 256 * N * r },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

// PHC strings use base64 without padding.
function base64(bytes: Buffer) {
  return bytes.toString("base64").replace(/=+$/, "");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, SETTINGS);
  const { ln, r, p } = SETTINGS;
  return `$scrypt$ln=${ln},r=${r},p=${p}$${base64(salt)}$${base64(key)}`;
}

// Checked in place of a missing hash, so a login with an unknown name takes
// as long as one with a wrong password.
let decoy: Promise<string> | undefined;

/** Whether the password matches the hash; never true without a hash. */
export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  const parts = ENCODED.exec(hash ?? (await (decoy ??= hashPassword(""))));
  if (!parts) return false;
  const [, ln, r, p, salt, expected] = parts;
  try {
    const key = await derive(password, Buffer.from(salt, "base64"), {
      ln: Number(ln),
      r: Number(r),
      p: Number(p),
    });
    // Throws if the stored hash is another length.
    return (
      timingSafeEqual(key, Buffer.from(expected, "base64")) && hash != null
    );
  } catch {
    // Settings scrypt won't take
    return false;
  }
}
