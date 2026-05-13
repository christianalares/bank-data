import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { mutations } from '#/mutations'
import { queries } from '#/queries'

import { popAlert } from '.'

type Props = {
  attachmentId: string
  transactionId?: string
}

export function ConfirmDeleteAttachmentAlert({ attachmentId, transactionId }: Props) {
  const queryClient = useQueryClient()

  const deleteAttachmentMutation = useMutation({
    ...mutations.banking.deleteAttachment(),
    onSuccess: () => {
      if (transactionId) {
        queryClient.invalidateQueries(queries.banking.transactionAttachments(transactionId))
      }
      queryClient.invalidateQueries(queries.banking.transactions())
      queryClient.invalidateQueries({ queryKey: ['banking', 'inbox'] })
      toast.success('Attachment deleted')
      popAlert('confirmDeleteAttachment')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not delete attachment'
      toast.error(message)
    },
  })

  function handleDelete() {
    deleteAttachmentMutation.mutate({ attachmentId })
  }

  return (
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Delete attachment?</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently delete the file. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <AlertDialogFooter>
        <AlertDialogCancel disabled={deleteAttachmentMutation.isPending}>Cancel</AlertDialogCancel>
        <Button
          type="button"
          variant="destructive"
          disabled={deleteAttachmentMutation.isPending}
          onClick={handleDelete}
        >
          {deleteAttachmentMutation.isPending ? 'Deleting...' : 'Delete'}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}
