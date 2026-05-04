import { useMutation } from '@tanstack/react-query'
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
  entryId: string
  year: number
  onDeleted: () => void
}

export function ConfirmDeleteTimeEntryAlert({ entryId, year, onDeleted }: Props) {
  const deleteTimeEntryMutation = useMutation({
    ...mutations.tracker.deleteTimeEntry(),
    onSuccess: async (_result, _variables, _onMutateResult, context) => {
      await context.client.invalidateQueries(queries.tracker.year({ year }))
    },
  })

  function handleDelete() {
    deleteTimeEntryMutation.mutate(
      {
        id: entryId,
      },
      {
        onSuccess: () => {
          onDeleted()
          toast.success('Entry deleted')
          popAlert('confirmDeleteTimeEntry')
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Could not delete entry'
          toast.error(message)
        },
      },
    )
  }

  return (
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Delete entry?</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently delete the time entry. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <AlertDialogFooter>
        <AlertDialogCancel disabled={deleteTimeEntryMutation.isPending}>Cancel</AlertDialogCancel>
        <Button
          type="button"
          variant="destructive"
          disabled={deleteTimeEntryMutation.isPending}
          onClick={handleDelete}
        >
          {deleteTimeEntryMutation.isPending ? 'Deleting...' : 'Delete'}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}
