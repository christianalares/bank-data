import { queryOptions } from '@tanstack/react-query'

import { serverFns } from '#/server-fns'

export const transactions = () =>
  queryOptions({
    queryKey: ['banking', 'transactions'],
    queryFn: () => serverFns.banking.getTransactions(),
  })
