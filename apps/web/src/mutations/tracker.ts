import { mutationOptions } from '@tanstack/react-query'

import { type ServerFnInput, serverFns } from '#/server-fns'

export const saveProject = () =>
  mutationOptions({
    mutationKey: ['tracker', 'saveProject'],
    mutationFn: (input: ServerFnInput<typeof serverFns.tracker.saveProject>) =>
      serverFns.tracker.saveProject({
        data: input,
      }),
  })

export const saveTimeEntry = () =>
  mutationOptions({
    mutationKey: ['tracker', 'saveTimeEntry'],
    mutationFn: (input: ServerFnInput<typeof serverFns.tracker.saveTimeEntry>) =>
      serverFns.tracker.saveTimeEntry({
        data: input,
      }),
  })

export const deleteTimeEntry = () =>
  mutationOptions({
    mutationKey: ['tracker', 'deleteTimeEntry'],
    mutationFn: (input: ServerFnInput<typeof serverFns.tracker.deleteTimeEntry>) =>
      serverFns.tracker.deleteTimeEntry({
        data: input,
      }),
  })

export const deleteProject = () =>
  mutationOptions({
    mutationKey: ['tracker', 'deleteProject'],
    mutationFn: (input: ServerFnInput<typeof serverFns.tracker.deleteProject>) =>
      serverFns.tracker.deleteProject({
        data: input,
      }),
  })
