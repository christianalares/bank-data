import { createFileRoute, redirect } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { getCurrentSession } from '#/lib/session'
import { authClient } from '#auth/client'

export const Route = createFileRoute('/login')({
  validateSearch: (search): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: async () => {
    const session = await getCurrentSession()

    if (session) {
      throw redirect({ to: '/' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const search = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const result = await authClient.signIn.email({
      email,
      password,
    })

    setIsSubmitting(false)

    if (result.error) {
      setError(result.error.message ?? 'Could not log in with those credentials.')
      return
    }

    window.location.href = search.redirect ?? '/'
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Log in to Hidden Village</CardTitle>
          <CardDescription>
            Email/password auth is local to this private app. Gmail connects later as inbox data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="login-form" onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  placeholder="you@example.com"
                  autoComplete="email"
                  onChange={(event) => {
                    setEmail(event.target.value)
                  }}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => {
                    setPassword(event.target.value)
                  }}
                  required
                />
                <FieldDescription>
                  Use the seed script to create the first admin account before logging in.
                </FieldDescription>
              </Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter>
          <Button className="w-full" type="submit" form="login-form" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in...' : 'Log in'}
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
