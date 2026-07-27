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

export const personalTransactions = (input: {
  query?: string
  accountId?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
}) =>
  queryOptions({
    queryKey: ['banking', 'personal-transactions', input],
    queryFn: () => serverFns.banking.getPersonalTransactions({ data: input }),
  })

export const personalConnections = () =>
  queryOptions({
    queryKey: ['banking', 'personal-connections'],
    queryFn: () => serverFns.banking.getPersonalConnections(),
  })

export const personalMcpTokens = () =>
  queryOptions({
    queryKey: ['banking', 'personal-mcp-tokens'],
    queryFn: () => serverFns.banking.getPersonalMcpTokens(),
  })

export const personalBankProviders = (country: string) =>
  queryOptions({
    queryKey: ['banking', 'personal-bank-providers', country],
    queryFn: () =>
      serverFns.banking.getPersonalBankProviders({
        data: { country },
      }),
    staleTime: 1000 * 60 * 60,
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
