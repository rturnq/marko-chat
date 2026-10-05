import { argon2id, argon2Verify } from "hash-wasm";

/*
 * Argon2id, through hash-wasm: WebAssembly, so it runs on Cloudflare Workers
 * as well as Node, where native password hashers can't. Each hash gets a
 * random 16-byte salt, and is stored in the standard encoded form
 * (`$argon2id$v=19$m=…,t=…,p=…$salt$hash`), which carries its salt and
 * settings, so they can be raised later without breaking stored hashes.
 *
 * 4 MiB of memory, 1 pass, 1 lane: about a tenth of OWASP's baseline (19 MiB,
 * 2 passes), for now, so a hash takes a few milliseconds and fits in the 10ms
 * of CPU a request gets on Workers' free plan. The 8-character minimum
 * password makes up more than the difference. Raise these on a paid plan.
 */
const SETTINGS = {
  memorySize: 4 * 1024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
};
const SALT_LENGTH = 16;

// The same password typed with composed or decomposed characters matches.
function normalize(password: string) {
  return password.normalize("NFKC");
}

export function hashPassword(password: string): Promise<string> {
  return argon2id({
    ...SETTINGS,
    password: normalize(password),
    salt: crypto.getRandomValues(new Uint8Array(SALT_LENGTH)),
    outputType: "encoded",
  });
}

// Checked in place of a missing hash, so a login with an unknown name takes
// as long as one with a wrong password.
let decoy: Promise<string> | undefined;

/** Whether the password matches the hash; never true without a hash. */
export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  try {
    const matches = await argon2Verify({
      password: normalize(password),
      hash: hash ?? (await (decoy ??= hashPassword(""))),
    });
    return matches && hash != null;
  } catch {
    // Not a hash argon2 can read
    return false;
  }
}
