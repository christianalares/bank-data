import { z } from 'zod'

export const providerFailureSchema = z.object({
  kind: z.enum([
    'rate_limited',
    'consent_expired',
    'provider_error',
    'invalid_response',
    'timeout',
    'network_error',
    'configuration_error',
    'authorization_changed',
    'incomplete_response',
  ]),
  httpStatus: z.number().int().nullable(),
  providerCode: z.string().nullable(),
  retryAfterSeconds: z.number().int().nonnegative().nullable(),
})
export type ProviderFailure = z.infer<typeof providerFailureSchema>

export class EnableBankingRequestError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly failure?: ProviderFailure,
  ) {
    super(message)
    this.name = 'EnableBankingRequestError'
  }
}

export function providerFailure(
  kind: ProviderFailure['kind'],
  details: Partial<ProviderFailure> = {},
): ProviderFailure {
  return { kind, httpStatus: null, providerCode: null, retryAfterSeconds: null, ...details }
}

export function classifyProviderFailure(error: unknown): ProviderFailure {
  if (error instanceof Error && 'failure' in error) {
    const failure = providerFailureSchema.safeParse(error.failure)
    if (failure.success) return failure.data
  }
  if (error instanceof EnableBankingRequestError && error.failure) return error.failure
  const message = error instanceof Error ? error.message : ''
  if (/\(429\)|ASPSP_RATE_LIMIT_EXCEEDED/.test(message))
    return providerFailure('rate_limited', { httpStatus: 429 })
  if (/\(401\)|\(403\)|Bank consent expired/.test(message))
    return providerFailure('consent_expired')
  return providerFailure(
    error instanceof EnableBankingRequestError ? 'provider_error' : 'configuration_error',
  )
}
