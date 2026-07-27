import { useMutation } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '#/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { mutations } from '#/mutations'

import { popSheet } from '.'

export type PersonalAccountSheetAccount = {
  id: string
  name: string
  originalName: string
}

export function PersonalAccountSheet({ account }: { account: PersonalAccountSheetAccount }) {
  const [name, setName] = useState(account.name)
  const updateName = useMutation({
    ...mutations.banking.updatePersonalAccountName(),
    onSuccess: async (_result, _variables, _onMutateResult, context) => {
      await Promise.all([
        context.client.invalidateQueries({ queryKey: ['banking', 'personal-connections'] }),
        context.client.invalidateQueries({ queryKey: ['banking', 'personal-transactions'] }),
      ])
      toast.success('Account name updated')
      popSheet('personalAccount')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not rename account')
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateName.mutate({
      accountId: account.id,
      name: name.trim() || null,
    })
  }

  return (
    <SheetContent className="sm:max-w-md">
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
        <SheetHeader>
          <SheetTitle>Rename account</SheetTitle>
          <SheetDescription>
            Give this account a private name that is easier to recognize.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="personal-account-name">Account name</FieldLabel>
              <Input
                id="personal-account-name"
                value={name}
                maxLength={100}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
              <FieldDescription>
                Bank name: {account.originalName}. Clear the field or use the bank name to remove
                your alias.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </div>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => popSheet('personalAccount')}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateName.isPending}>
            {updateName.isPending ? 'Saving…' : 'Save name'}
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  )
}
