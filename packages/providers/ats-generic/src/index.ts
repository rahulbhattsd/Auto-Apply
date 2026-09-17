import { ProviderRegistry } from '@autoapply/providers-core';
import { AtsGenericProvider } from './AtsGenericProvider.js';

export * from './adapters/index.js';
export * from './AtsGenericProvider.js';

export const atsGenericProvider = new AtsGenericProvider();
ProviderRegistry.register(atsGenericProvider);
