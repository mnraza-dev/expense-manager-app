import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { verifier, equalHex } from './crypto';
export type LockRecord = {
  version: 1;
  salt: string;
  hash: string;
  failures: number;
  retryAt: number;
  biometric: boolean;
  relockSeconds: number;
};
export interface LockStorage {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}
export function shouldRelock(backgroundAt: number, now: number, seconds: number) {
  return now - backgroundAt >= seconds * 1000;
}
export class LockCore {
  record: LockRecord | null = null;
  constructor(
    private storage: LockStorage,
    private random: (n: number) => Uint8Array,
    private now: () => number = Date.now
  ) {}
  async load() {
    const value = await this.storage.get();
    if (!value) {
      this.record = null;
      return;
    }
    const r = JSON.parse(value);
    if (
      r.version !== 1 ||
      !/^[a-f0-9]{32}$/.test(r.salt) ||
      !/^[a-f0-9]{64}$/.test(r.hash) ||
      !Number.isSafeInteger(r.failures) ||
      r.failures < 0 ||
      !Number.isSafeInteger(r.retryAt) ||
      typeof r.biometric !== 'boolean' ||
      ![0, 30, 60, 300].includes(r.relockSeconds)
    )
      throw new Error('Secure lock settings could not be read. Retry without resetting your data.');
    this.record = r;
  }
  private async persist(record: LockRecord) {
    await this.storage.set(JSON.stringify(record));
    this.record = record;
  }
  async check(passcode: string) {
    const r = this.record;
    if (!r) throw new Error('App lock is not configured.');
    if (this.now() < r.retryAt)
      throw new Error(`Try again in ${Math.ceil((r.retryAt - this.now()) / 1000)} seconds.`);
    // Persist attempt before costly verification: interruption cannot reset throttling.
    const failures = r.failures + 1;
    await this.persist({
      ...r,
      failures,
      retryAt: this.now() + Math.min(3600, 2 ** Math.min(failures, 12)) * 1000,
    });
    if (passcode.length > 128 || !equalHex(await verifier(passcode, hexToBytes(r.salt)), r.hash))
      throw new Error('Incorrect passcode. Wait before trying again.');
    await this.persist({ ...r, failures: 0, retryAt: 0 });
  }
  async enable(passcode: string) {
    if (this.record) throw new Error('Authenticate before changing the passcode.');
    if (!/^\d{6,12}$/.test(passcode)) throw new Error('Use a passcode of 6–12 digits.');
    const salt = this.random(16);
    await this.persist({
      version: 1,
      salt: bytesToHex(salt),
      hash: await verifier(passcode, salt),
      failures: 0,
      retryAt: 0,
      biometric: false,
      relockSeconds: 0,
    });
  }
  async change(current: string, next: string) {
    await this.check(current);
    if (!/^\d{6,12}$/.test(next)) throw new Error('Use a passcode of 6–12 digits.');
    const salt = this.random(16);
    await this.persist({
      ...this.record!,
      salt: bytesToHex(salt),
      hash: await verifier(next, salt),
    });
  }
  async disable(current: string) {
    await this.check(current);
    await this.storage.remove();
    this.record = null;
  }
  async configure(current: string, biometric: boolean, relockSeconds: number) {
    await this.check(current);
    if (![0, 30, 60, 300].includes(relockSeconds)) throw new Error('Invalid relock interval.');
    await this.persist({ ...this.record!, biometric, relockSeconds });
  }
}

export async function authenticateBiometric(
  available: () => Promise<boolean>,
  authenticate: () => Promise<boolean>
) {
  if (!(await available()))
    throw new Error('Biometrics are unavailable or enrollment changed. Use your app passcode.');
  if (!(await authenticate()))
    throw new Error('Biometric authentication did not complete. Use your app passcode.');
}
