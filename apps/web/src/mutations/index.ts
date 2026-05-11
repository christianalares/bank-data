import type { UseMutationOptions } from '@tanstack/react-query'

import * as banking from './banking'
import * as jobs from './jobs'
import * as tracker from './tracker'

export const mutations = {
  banking,
  jobs,
  tracker,
}

type InferMutationOptionsInput<T> =
  T extends UseMutationOptions<any, any, infer TVariables, any> ? TVariables : never

type InferMutationOptionsOutput<T> =
  T extends UseMutationOptions<infer TData, any, any, any> ? TData : never

type InferMutationInput<T> = T extends (...args: any[]) => infer R
  ? InferMutationOptionsInput<R>
  : MutationInput<T>

type InferMutationOutput<T> = T extends (...args: any[]) => infer R
  ? InferMutationOptionsOutput<R>
  : MutationOutput<T>

export type MutationInput<T = typeof mutations> = {
  [K in keyof T]: InferMutationInput<T[K]>
}

export type MutationOutput<T = typeof mutations> = {
  [K in keyof T]: InferMutationOutput<T[K]>
}
