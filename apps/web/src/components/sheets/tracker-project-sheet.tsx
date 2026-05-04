import { useMutation } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { mutations } from '#/mutations'
import { queries } from '#/queries'

import { popSheet } from '.'

export type TrackerProjectForm = {
  id?: string
  name: string
  hourlyRate: string
  currency: string
  billable: boolean
  archived: boolean
}

type Props = {
  year: number
  project: TrackerProjectForm
}

export function TrackerProjectSheet({ year, project }: Props) {
  const [projectForm, setProjectForm] = useState(project)
  const [error, setError] = useState<string | null>(null)
  const saveProjectMutation = useMutation({
    ...mutations.tracker.saveProject(),
    onSuccess: async (_result, _variables, _onMutateResult, context) => {
      await context.client.invalidateQueries(queries.tracker.year({ year }))
    },
  })

  function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    saveProjectMutation.mutate(projectForm, {
      onSuccess: () => {
        toast.success(projectForm.id ? 'Project updated' : 'Project created')
        popSheet('trackerProject')
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'Could not save project'
        setError(message)
        toast.error(message)
      },
    })
  }

  return (
    <SheetContent className="sm:max-w-md">
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleProjectSubmit}>
        <SheetHeader>
          <SheetTitle>{projectForm.id ? 'Edit project' : 'Create project'}</SheetTitle>
          <SheetDescription>
            Projects group time entries and provide the rate used for billable totals.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-name">Name</FieldLabel>
              <Input
                id="project-name"
                value={projectForm.name}
                onChange={(event) => {
                  setProjectForm({ ...projectForm, name: event.target.value })
                }}
                required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="project-hourly-rate">Hourly rate</FieldLabel>
                <Input
                  id="project-hourly-rate"
                  inputMode="decimal"
                  value={projectForm.hourlyRate}
                  onChange={(event) => {
                    setProjectForm({ ...projectForm, hourlyRate: event.target.value })
                  }}
                  placeholder="950"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="project-currency">Currency</FieldLabel>
                <Input
                  id="project-currency"
                  value={projectForm.currency}
                  onChange={(event) => {
                    setProjectForm({ ...projectForm, currency: event.target.value })
                  }}
                  maxLength={3}
                  required
                />
              </Field>
            </div>
            <Field orientation="horizontal">
              <Checkbox
                id="project-billable"
                checked={projectForm.billable}
                onCheckedChange={(checked) => {
                  setProjectForm({ ...projectForm, billable: checked === true })
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor="project-billable">Billable by default</FieldLabel>
                <FieldDescription>New entries can still override this per entry.</FieldDescription>
              </FieldContent>
            </Field>
            {projectForm.id ? (
              <Field orientation="horizontal">
                <Checkbox
                  id="project-archived"
                  checked={projectForm.archived}
                  onCheckedChange={(checked) => {
                    setProjectForm({ ...projectForm, archived: checked === true })
                  }}
                />
                <FieldLabel htmlFor="project-archived">Archive project</FieldLabel>
              </Field>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </FieldGroup>
        </div>
        <SheetFooter>
          <Button type="submit" disabled={saveProjectMutation.isPending}>
            {saveProjectMutation.isPending
              ? 'Saving...'
              : projectForm.id
                ? 'Save project'
                : 'Create project'}
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  )
}
