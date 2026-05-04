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
  projectId: string
  projectName: string
  year: number
}

export function ConfirmDeleteTrackerProjectAlert({ projectId, projectName, year }: Props) {
  const deleteProjectMutation = useMutation({
    ...mutations.tracker.deleteProject(),
    onSuccess: async (_result, _variables, _onMutateResult, context) => {
      await context.client.invalidateQueries(queries.tracker.year({ year }))
    },
  })

  function handleDelete() {
    deleteProjectMutation.mutate(
      {
        id: projectId,
      },
      {
        onSuccess: () => {
          toast.success('Project deleted')
          popAlert('confirmDeleteTrackerProject')
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Could not delete project'
          toast.error(message)
        },
      },
    )
  }

  return (
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Delete project?</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently delete "{projectName}" and all time entries connected to it. This
          action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <AlertDialogFooter>
        <AlertDialogCancel disabled={deleteProjectMutation.isPending}>Cancel</AlertDialogCancel>
        <Button
          type="button"
          variant="destructive"
          disabled={deleteProjectMutation.isPending}
          onClick={handleDelete}
        >
          {deleteProjectMutation.isPending ? 'Deleting...' : 'Delete'}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}
