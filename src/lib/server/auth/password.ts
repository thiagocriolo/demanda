import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const PASSWORD_MIN_CHARACTERS = 6;
export const PASSWORD_MAX_CHARACTERS = 16;
export const PASSWORD_MAX_UTF8_BYTES = 64;
export const PASSWORD_VERIFICATION_MAX_CHARACTERS = 128;
export const PASSWORD_VERIFICATION_MAX_UTF8_BYTES = 512;
// Compatibility aliases used by the request-validation layer.
export const MIN_PASSWORD_CHARACTERS = PASSWORD_MIN_CHARACTERS;
export const MAX_PASSWORD_CHARACTERS = PASSWORD_MAX_CHARACTERS;

export const PASSWORD_POLICY = Object.freeze({
  minCharacters: PASSWORD_MIN_CHARACTERS,
  maxCharacters: PASSWORD_MAX_CHARACTERS,
  maxUtf8Bytes: PASSWORD_MAX_UTF8_BYTES,
});

export type PasswordValidationResult =
  { valid: true } | { valid: false; message: string };

const HASH_ALGORITHM = "scrypt";
const HASH_VERSION = 1;
const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEY_BYTES = 64;
const SCRYPT_MAX_MEMORY_BYTES = 256 * 1024 * 1024;
const MIN_SUPPORTED_SCRYPT_N = 2 ** 14;

// Public by design: this is a timing-equalization hash, not an account secret.
// Its known input is "demanda-invalid-user-password-v1" and must never be used
// as an account password or for any purpose other than an unknown-user check.
export const DUMMY_PASSWORD_HASH =
  "scrypt$1$131072$8$1$jxHZE7x8bD5oyp8rfpLtQQ$FutyWF_bAOWq-VjDg7yfcPBe51GLfWuSTlHdXNh_yn2H9gXoVvAQrqFwrjeJD44KkftDFvkCIw3eJ7e30ja0PA";

interface ParsedPasswordHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

export function validatePassword(password: string): PasswordValidationResult {
  if (typeof password !== "string") {
    return { valid: false, message: "A senha deve ser um texto." };
  }

  const characterCount = Array.from(password).length;

  if (characterCount < PASSWORD_MIN_CHARACTERS) {
    return {
      valid: false,
      message: `A senha deve ter pelo menos ${PASSWORD_MIN_CHARACTERS} caracteres.`,
    };
  }

  if (characterCount > PASSWORD_MAX_CHARACTERS) {
    return {
      valid: false,
      message: `A senha deve ter no máximo ${PASSWORD_MAX_CHARACTERS} caracteres.`,
    };
  }

  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_UTF8_BYTES) {
    return {
      valid: false,
      message: "A senha excede o tamanho máximo permitido em UTF-8.",
    };
  }

  if (!/\p{Lu}/u.test(password)) {
    return {
      valid: false,
      message: "A senha deve conter pelo menos uma letra maiúscula.",
    };
  }

  if (!/\p{Ll}/u.test(password)) {
    return {
      valid: false,
      message: "A senha deve conter pelo menos uma letra minúscula.",
    };
  }

  if (!/\p{Nd}/u.test(password)) {
    return {
      valid: false,
      message: "A senha deve conter pelo menos um número.",
    };
  }

  return { valid: true };
}

export async function hashPassword(password: string): Promise<string> {
  const validation = validatePassword(password);

  if (!validation.valid) {
    throw new RangeError(validation.message);
  }

  const salt = cryptoRandomSalt();
  const key = await deriveKey(password, salt, {
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    HASH_ALGORITHM,
    HASH_VERSION,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  if (!isPasswordWithinVerificationLimits(password)) {
    return false;
  }

  const parsedHash = parsePasswordHash(encodedHash);

  if (!parsedHash) {
    return false;
  }

  try {
    const candidateKey = await deriveKey(password, parsedHash.salt, parsedHash);
    return timingSafeEqual(candidateKey, parsedHash.key);
  } catch {
    return false;
  }
}

export function passwordNeedsRehash(encodedHash: string): boolean {
  const parsedHash = parsePasswordHash(encodedHash);

  return (
    !parsedHash ||
    parsedHash.n !== SCRYPT_N ||
    parsedHash.r !== SCRYPT_R ||
    parsedHash.p !== SCRYPT_P ||
    parsedHash.salt.length !== SCRYPT_SALT_BYTES ||
    parsedHash.key.length !== SCRYPT_KEY_BYTES
  );
}

function isPasswordWithinVerificationLimits(password: string): boolean {
  return (
    typeof password === "string" &&
    Array.from(password).length <= PASSWORD_VERIFICATION_MAX_CHARACTERS &&
    Buffer.byteLength(password, "utf8") <= PASSWORD_VERIFICATION_MAX_UTF8_BYTES
  );
}

function parsePasswordHash(encodedHash: string): ParsedPasswordHash | null {
  if (typeof encodedHash !== "string") {
    return null;
  }

  const [
    algorithm,
    versionText,
    nText,
    rText,
    pText,
    saltText,
    keyText,
    extra,
  ] = encodedHash.split("$");

  if (
    extra !== undefined ||
    algorithm !== HASH_ALGORITHM ||
    versionText !== String(HASH_VERSION)
  ) {
    return null;
  }

  const n = parsePositiveInteger(nText);
  const r = parsePositiveInteger(rText);
  const p = parsePositiveInteger(pText);
  const salt = decodeCanonicalBase64Url(saltText);
  const key = decodeCanonicalBase64Url(keyText);

  if (
    n === null ||
    r === null ||
    p === null ||
    !isSupportedScryptParameters(n, r, p) ||
    !salt ||
    salt.length < SCRYPT_SALT_BYTES ||
    salt.length > 64 ||
    !key ||
    key.length !== SCRYPT_KEY_BYTES
  ) {
    return null;
  }

  return { n, r, p, salt, key };
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isSupportedScryptParameters(n: number, r: number, p: number): boolean {
  return (
    n >= MIN_SUPPORTED_SCRYPT_N &&
    n <= SCRYPT_N &&
    (n & (n - 1)) === 0 &&
    r === SCRYPT_R &&
    p === SCRYPT_P
  );
}

function decodeCanonicalBase64Url(value: string | undefined): Buffer | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : null;
}

function deriveKey(
  password: string,
  salt: Buffer,
  parameters: Pick<ParsedPasswordHash, "n" | "r" | "p">,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_BYTES,
      {
        N: parameters.n,
        r: parameters.r,
        p: parameters.p,
        maxmem: SCRYPT_MAX_MEMORY_BYTES,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

function cryptoRandomSalt(): Buffer {
  return randomBytes(SCRYPT_SALT_BYTES);
}
