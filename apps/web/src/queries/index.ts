import type { UseQueryOptions } from '@tanstack/react-query'

import * as banking from './banking'
import * as jobs from './jobs'
import * as tracker from './tracker'

export const queries = {
  banking,
  jobs,
  tracker,
}

type InferQueryData<T> = T extends UseQueryOptions<infer TData, any, any, any> ? TData : never
type InferQueryInput<T> = T extends (...args: infer TArgs) => unknown
  ? TArgs extends []
    ? undefined
    : TArgs[0]
  : QueryInput<T>

export type QueryInput<T = typeof queries> = {
  [K in keyof T]: InferQueryInput<T[K]>
}

export type QueryOutput<T = typeof queries> = {
  [K in keyof T]: T[K] extends (...args: never[]) => infer R ? InferQueryData<R> : QueryOutput<T[K]>
}
