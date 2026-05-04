import { queues } from './queues'

export type BankingJobName = 'sync-connection' | 'sync-account' | 'refresh-balances'
export type InboxJobName = 'sync-gmail' | 'process-email' | 'process-attachment'
export type MatchingJobName = 'match-inbox-item' | 'match-transaction'
export type ExportJobName = 'create-accountant-export'

export async function enqueueBankingJob(name: BankingJobName, data: Record<string, unknown>) {
  return queues.banking.add(name, data)
}

export async function enqueueInboxJob(name: InboxJobName, data: Record<string, unknown>) {
  return queues.inbox.add(name, data)
}

export async function enqueueMatchingJob(name: MatchingJobName, data: Record<string, unknown>) {
  return queues.matching.add(name, data)
}

export async function enqueueExportJob(name: ExportJobName, data: Record<string, unknown>) {
  return queues.exports.add(name, data)
}

export { type QueueName, queueNames, queues } from './queues'
