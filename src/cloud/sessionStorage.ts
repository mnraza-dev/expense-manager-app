import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { gcm } from '@noble/ciphers/aes.js';
import { digest } from '../security/crypto';
export interface KeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export function secureSessionStorage(
  large: KeyValue,
  secrets: KeyValue,
  random: (n: number) => Uint8Array
): KeyValue {
  return {
    async getItem(name) {
      const text = await large.getItem(name);
      if (!text) return null;
      if (text.length > 2000000) throw new Error('Invalid stored session.');
      const key = await secrets.getItem('session.' + digest(name));
      if (!key) throw new Error('Secure session key is unavailable. Sign in again.');
      const e = JSON.parse(text);
      if (
        e.version !== 1 ||
        !/^[a-f0-9]{24}$/.test(e.nonce) ||
        typeof e.ciphertext !== 'string' ||
        !/^[a-f0-9]+$/.test(e.ciphertext)
      )
        throw new Error('Invalid encrypted session.');
      const bytes = hexToBytes(key);
      try {
        return new TextDecoder().decode(
          gcm(bytes, hexToBytes(e.nonce)).decrypt(hexToBytes(e.ciphertext))
        );
      } finally {
        bytes.fill(0);
      }
    },
    async setItem(name, value) {
      if (value.length > 500000) throw new Error('Session exceeds supported storage size.');
      const keyName = 'session.' + digest(name);
      let key = await secrets.getItem(keyName);
      if (!key) {
        key = bytesToHex(random(32));
        await secrets.setItem(keyName, key);
      }
      const bytes = hexToBytes(key),
        nonce = random(12);
      try {
        await large.setItem(
          name,
          JSON.stringify({
            version: 1,
            nonce: bytesToHex(nonce),
            ciphertext: bytesToHex(gcm(bytes, nonce).encrypt(utf8ToBytes(value))),
          })
        );
      } finally {
        bytes.fill(0);
      }
    },
    async removeItem(name) {
      await large.removeItem(name);
      await secrets.removeItem('session.' + digest(name));
    },
  };
}
