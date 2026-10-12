export type UpdatePlatform = 'android' | 'ios';
export interface UpdatePolicy {
  platform: UpdatePlatform;
  enabled: boolean;
  minimum_version: string;
  minimum_build: string | null;
  store_url: string | null;
  message: string;
}
export interface InstalledVersion {
  version: string | null;
  build: string | null;
}
function versionParts(value: unknown, build = false): number[] | null {
  if (
    typeof value !== 'string' ||
    !(build ? /^\d{1,9}(\.\d{1,9}){0,2}$/ : /^\d{1,9}\.\d{1,9}\.\d{1,9}$/).test(value)
  )
    return null;
  return value.split('.').map(Number);
}
export function compareVersions(a: string, b: string, build = false): number {
  const left = versionParts(a, build),
    right = versionParts(b, build);
  if (!left || !right) throw new Error('Invalid native version.');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
export function validUpdateURL(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function parseUpdatePolicy(value: unknown, platform: UpdatePlatform): UpdatePolicy {
  if (!value || typeof value !== 'object') throw new Error('Missing update policy.');
  const p = value as Record<string, unknown>;
  if (
    p.platform !== platform ||
    typeof p.enabled !== 'boolean' ||
    !versionParts(p.minimum_version) ||
    (p.minimum_build !== null && !versionParts(p.minimum_build, true)) ||
    (p.store_url !== null && !validUpdateURL(p.store_url)) ||
    (p.enabled && !validUpdateURL(p.store_url)) ||
    typeof p.message !== 'string' ||
    p.message.length > 500
  )
    throw new Error('Invalid update policy.');
  return {
    platform,
    enabled: p.enabled,
    minimum_version: p.minimum_version as string,
    minimum_build: p.minimum_build as string | null,
    store_url: p.store_url as string | null,
    message: p.message,
  };
}
export function requiresUpdate(policy: UpdatePolicy | null, installed: InstalledVersion): boolean {
  if (!policy?.enabled) return false;
  if (!versionParts(installed.version)) return true;
  const comparison = compareVersions(installed.version!, policy.minimum_version);
  if (comparison !== 0) return comparison < 0;
  if (policy.minimum_build === null) return false;
  return (
    !versionParts(installed.build, true) ||
    compareVersions(installed.build!, policy.minimum_build, true) < 0
  );
}
export interface UpdateState {
  ready: boolean;
  checking: boolean;
  required: boolean;
  policy: UpdatePolicy | null;
  error: string | null;
}
export interface UpdatePort {
  readCache(): Promise<string | null>;
  writeCache(value: string): Promise<void>;
  fetchPolicy(): Promise<unknown>;
}
// A failed request never removes a previously confirmed requirement.
export class UpdateController {
  state: UpdateState = {
    ready: false,
    checking: false,
    required: false,
    policy: null,
    error: null,
  };
  private running: Promise<void> | null = null;
  private initialized = false;
  constructor(
    private platform: UpdatePlatform,
    private installed: InstalledVersion,
    private port: UpdatePort,
    private changed: (state: UpdateState) => void = () => {}
  ) {}
  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  refresh(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.check().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async check() {
    this.set({ checking: true, error: null });
    if (!this.initialized) {
      this.initialized = true;
      try {
        const cached = await this.port.readCache();
        if (cached) {
          const policy = parseUpdatePolicy(JSON.parse(cached), this.platform);
          this.set({ policy, required: requiresUpdate(policy, this.installed) });
        }
      } catch {
        /* Invalid cache is not an update instruction; fetch the authoritative policy. */
      }
    }
    try {
      const policy = parseUpdatePolicy(await this.port.fetchPolicy(), this.platform);
      this.set({ policy, required: requiresUpdate(policy, this.installed) });
      try {
        await this.port.writeCache(JSON.stringify(policy));
      } catch {
        this.set({
          error: 'The update check could not be saved on this device. Retry when connected.',
        });
      }
    } catch {
      this.set({ error: 'Could not check for updates. Connect to the internet and retry.' });
    } finally {
      this.set({ ready: true, checking: false });
    }
  }
}

export async function withUpdateTimeout<T>(
  request: PromiseLike<T>,
  abort: () => void,
  milliseconds = 4000
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        abort();
      } finally {
        reject(new Error('Update check timed out.'));
      }
    }, milliseconds);
  });
  try {
    return await Promise.race([Promise.resolve(request), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
