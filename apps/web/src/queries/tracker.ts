import { queryOptions } from '@tanstack/react-query'

import { serverFns } from '#/server-fns'

export const year = ({ year }: { year?: number }) =>
  queryOptions({
    queryKey: ['tracker', 'year', year ?? 'current'],
    queryFn: () =>
      serverFns.tracker.getYear({
        data: {
          year,
        },
      }),
  })
