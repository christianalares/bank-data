import { queryOptions } from '@tanstack/react-query'

import { serverFns } from '#/server-fns'

export const dashboard = () =>
  queryOptions({
    queryKey: ['jobs', 'dashboard'],
    queryFn: () => serverFns.jobs.getDashboard(),
  })
