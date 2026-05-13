import { queryOptions } from '@tanstack/react-query'

import { serverFns } from '#/server-fns'

export const transactions = () =>
  queryOptions({
    queryKey: ['banking', 'transactions'],
    queryFn: () => serverFns.banking.getTransactions(),
  })

export const transactionAttachments = (transactionId: string) =>
  queryOptions({
    queryKey: ['banking', 'attachments', transactionId],
    queryFn: () => serverFns.banking.getTransactionAttachments({ data: { transactionId } }),
  })

export const inboxAttachments = (status: 'all' | 'matched' | 'unmatched') =>
  queryOptions({
    queryKey: ['banking', 'inbox', status],
    queryFn: () => serverFns.banking.getInboxAttachments({ data: { status } }),
    staleTime: 1000 * 60 * 10,
  })
