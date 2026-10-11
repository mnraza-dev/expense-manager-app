import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { gcm } from '@noble/ciphers/aes.js';
export const KDF_ITERATIONS = 600000;
const aad = utf8ToBytes('Pocketbook|encrypted-backup|1|AES-256-GCM|PBKDF2-SHA256|600000');
export const digest = (text: string) => bytesToHex(sha256(utf8ToBytes(text)));
export async function derive(password: string, salt: Uint8Array) {
  return pbkdf2Async(sha256, utf8ToBytes(password), salt, {
    c: KDF_ITERATIONS,
    dkLen: 32,
    asyncTick: 10,
  });
}
export async function verifier(passcode: string, salt: Uint8Array) {
  const key = await derive(passcode, salt);
  try {
    return bytesToHex(key);
  } finally {
    key.fill(0);
  }
}
export function equalHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export async function encryptBackup(
  text: string,
  password: string,
  random: (size: number) => Uint8Array
) {
  if (password.length < 12 || password.length > 256)
    throw new Error('Use a backup password of 12–256 characters.');
  const salt = random(16),
    nonce = random(12),
    key = await derive(password, salt);
  try {
    return JSON.stringify({
      format: 'pocketbook-encrypted',
      version: 1,
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: KDF_ITERATIONS,
      salt: bytesToHex(salt),
      nonce: bytesToHex(nonce),
      ciphertext: bytesToHex(gcm(key, nonce, aad).encrypt(utf8ToBytes(text))),
    });
  } finally {
    key.fill(0);
  }
}
export async function decryptBackup(text: string, password: string) {
  let e;
  try {
    e = JSON.parse(text);
  } catch {
    throw new Error('Invalid encrypted backup file.');
  }
  if (
    e?.format !== 'pocketbook-encrypted' ||
    e.version !== 1 ||
    e.algorithm !== 'AES-256-GCM' ||
    e.kdf !== 'PBKDF2-SHA256' ||
    e.iterations !== KDF_ITERATIONS ||
    !/^[a-f0-9]{32}$/.test(e.salt) ||
    !/^[a-f0-9]{24}$/.test(e.nonce) ||
    typeof e.ciphertext !== 'string' ||
    e.ciphertext.length < 32 ||
    e.ciphertext.length > 40000032 ||
    e.ciphertext.length % 2 ||
    !/^[a-f0-9]+$/.test(e.ciphertext)
  )
    throw new Error('Unsupported or corrupted encrypted backup.');
  if (password.length > 256) throw new Error('Invalid password length.');
  const key = await derive(password, hexToBytes(e.salt));
  try {
    return new TextDecoder().decode(
      gcm(key, hexToBytes(e.nonce), aad).decrypt(hexToBytes(e.ciphertext))
    );
  } catch {
    throw new Error('Incorrect encryption password or damaged backup.');
  } finally {
    key.fill(0);
  }
}
