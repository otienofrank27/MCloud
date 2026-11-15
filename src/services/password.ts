import bcrypt from 'bcryptjs';

export const BCRYPT_SALT_ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// Precomputed valid bcrypt hash used to equalize response timing on unknown emails
const DUMMY_BCRYPT_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEeO6xH7R9J0E7J5w5T1B4F5oG2U8p2R3e6';

export function validatePasswordStrength(password: string): void {
  if (typeof password !== 'string') {
    throw new Error('Password must be a string.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`);
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    throw new Error(
      'Password must include at least one letter and one number or special character.'
    );
  }
}

export function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

export async function hashPassword(plainPassword: string): Promise<string> {
  validatePasswordStrength(plainPassword);
  const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
  return bcrypt.hash(plainPassword, salt);
}

export async function verifyPassword(
  plainPassword: string,
  storedHash: string
): Promise<boolean> {
  if (!plainPassword || !storedHash || !isBcryptHash(storedHash)) {
    await bcrypt.compare(plainPassword || 'invalid', DUMMY_BCRYPT_HASH);
    return false;
  }
  return bcrypt.compare(plainPassword, storedHash);
}

export function needsRehash(storedHash: string): boolean {
  if (!isBcryptHash(storedHash)) return true;
  try {
    return bcrypt.getRounds(storedHash) < BCRYPT_SALT_ROUNDS;
  } catch {
    return true;
  }
}

export function hashSecretWithBcrypt(secret: string): string {
  const salt = bcrypt.genSaltSync(BCRYPT_SALT_ROUNDS);
  return bcrypt.hashSync(secret, salt);
}

export function verifySecretWithBcrypt(secret: string, storedHash: string): boolean {
  if (!secret || !storedHash || !isBcryptHash(storedHash)) return false;
  return bcrypt.compareSync(secret, storedHash);
}
