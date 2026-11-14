import { AsyncLocalStorage } from 'node:async_hooks'
import type { ProviderFailure } from './provider-error'

const context = new AsyncLocalStorage<{
  beforeRequest: () => Promise<void>
  onRateLimit: (failure: ProviderFailure) => Promise<void>
}>()

export const bankFetchContext = {
  run: <T>(guard: NonNullable<ReturnType<typeof context.getStore>>, operation: () => Promise<T>) =>
    context.run(guard, operation),
  current: () => context.getStore(),
}
