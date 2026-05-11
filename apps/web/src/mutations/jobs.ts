import { mutationOptions } from '@tanstack/react-query'

import { serverFns } from '#/server-fns'

export const syncBankingNow = () =>
  mutationOptions({
    mutationKey: ['jobs', 'syncBankingNow'],
    mutationFn: () => serverFns.jobs.syncBankingNow(),
  })
