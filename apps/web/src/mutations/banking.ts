import { mutationOptions } from '@tanstack/react-query'

import { type ServerFnInput, serverFns } from '#/server-fns'

export const importTransactionsCsv = () =>
  mutationOptions({
    mutationKey: ['banking', 'importTransactionsCsv'],
    mutationFn: (input: ServerFnInput<typeof serverFns.banking.importTransactionsCsv>) =>
      serverFns.banking.importTransactionsCsv({
        data: input,
      }),
  })

export const startEnableBankingAuthorization = () =>
  mutationOptions({
    mutationKey: ['banking', 'startEnableBankingAuthorization'],
    mutationFn: (input: ServerFnInput<typeof serverFns.banking.startEnableBankingAuthorization>) =>
      serverFns.banking.startEnableBankingAuthorization({
        data: input,
      }),
  })
