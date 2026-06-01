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

export const exportTransactions = () =>
  mutationOptions({
    mutationKey: ['banking', 'exportTransactions'],
    mutationFn: (input: ServerFnInput<typeof serverFns.banking.exportTransactions>) =>
      serverFns.banking.exportTransactions({
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

export const updateTransactionNote = () =>
  mutationOptions({
    mutationKey: ['banking', 'updateTransactionNote'],
    mutationFn: (input: ServerFnInput<typeof serverFns.banking.updateTransactionNote>) =>
      serverFns.banking.updateTransactionNote({
        data: input,
      }),
  })

export const uploadAttachments = () =>
  mutationOptions({
    mutationKey: ['banking', 'uploadAttachments'],
    mutationFn: (formData: FormData) =>
      serverFns.banking.uploadAttachments({
        data: formData,
      }),
  })

export const deleteAttachment = () =>
  mutationOptions({
    mutationKey: ['banking', 'deleteAttachment'],
    mutationFn: (input: ServerFnInput<typeof serverFns.banking.deleteAttachment>) =>
      serverFns.banking.deleteAttachment({
        data: input,
      }),
  })

export const linkAttachmentToTransaction = () =>
  mutationOptions({
    mutationKey: ['banking', 'linkAttachmentToTransaction'],
    mutationFn: (input: ServerFnInput<typeof serverFns.banking.linkAttachmentToTransaction>) =>
      serverFns.banking.linkAttachmentToTransaction({
        data: input,
      }),
  })

export const unlinkAttachment = () =>
  mutationOptions({
    mutationKey: ['banking', 'unlinkAttachment'],
    mutationFn: (input: ServerFnInput<typeof serverFns.banking.unlinkAttachment>) =>
      serverFns.banking.unlinkAttachment({
        data: input,
      }),
  })

export const approveSuggestedMatch = () =>
  mutationOptions({
    mutationKey: ['banking', 'approveSuggestedMatch'],
    mutationFn: (input: ServerFnInput<typeof serverFns.banking.approveSuggestedMatch>) =>
      serverFns.banking.approveSuggestedMatch({
        data: input,
      }),
  })

export const dismissSuggestedMatch = () =>
  mutationOptions({
    mutationKey: ['banking', 'dismissSuggestedMatch'],
    mutationFn: (input: ServerFnInput<typeof serverFns.banking.dismissSuggestedMatch>) =>
      serverFns.banking.dismissSuggestedMatch({
        data: input,
      }),
  })

export const disconnectGmail = () =>
  mutationOptions({
    mutationKey: ['banking', 'disconnectGmail'],
    mutationFn: () => serverFns.banking.disconnectGmail({ data: undefined }),
  })

export const triggerGmailSync = () =>
  mutationOptions({
    mutationKey: ['banking', 'triggerGmailSync'],
    mutationFn: () => serverFns.banking.triggerGmailSync({ data: undefined }),
  })
