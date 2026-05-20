import { queryOptions } from '@tanstack/react-query'

import { serverFns } from '#/server-fns'

export const gmailConnection = () =>
  queryOptions({
    queryKey: ['banking', 'gmail-connection'],
    queryFn: () => serverFns.banking.getGmailConnection(),
    staleTime: 1000 * 60,
  })

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

export const suggestedAttachments = (transactionId: string) =>
  queryOptions({
    queryKey: ['banking', 'suggested-attachments', transactionId],
    queryFn: () =>
      serverFns.banking.getSuggestedAttachmentsForTransaction({ data: { transactionId } }),
    staleTime: 1000 * 30,
  })

export const inboxAttachments = (status: 'all' | 'matched' | 'unmatched') =>
  queryOptions({
    queryKey: ['banking', 'inbox', status],
    queryFn: () => serverFns.banking.getInboxAttachments({ data: { status } }),
    staleTime: 1000 * 30,
  })
