import * as tracker from './tracker'

export const serverFns = {
  tracker,
}

export type ServerFnInput<T> = T extends (args: { data: infer TInput }) => unknown ? TInput : never

export type ServerFnOutput<T> = T extends (...args: any[]) => infer TOutput
  ? Awaited<TOutput>
  : never
