import type { JobProvider, ProviderId } from './types.js';

export class ProviderRegistry {
  private static providers = new Map<ProviderId, JobProvider>();

  static register(provider: JobProvider): void {
    this.providers.set(provider.id, provider);
  }

  static get(id: ProviderId): JobProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Provider "${id}" is not registered`);
    }
    return provider;
  }

  static has(id: ProviderId): boolean {
    return this.providers.has(id);
  }

  static getAll(): JobProvider[] {
    return Array.from(this.providers.values());
  }

  static unregister(id: ProviderId): boolean {
    return this.providers.delete(id);
  }

  static clear(): void {
    this.providers.clear();
  }
}
