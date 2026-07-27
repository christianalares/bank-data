import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { mutations } from '#/mutations'
import { queries } from '#/queries'
import { serverFns } from '#/server-fns'

export const Route = createFileRoute('/_protected/personal/connections')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(queries.banking.personalConnections()),
      context.queryClient.ensureQueryData(queries.banking.personalBankProviders('SE')),
      context.queryClient.ensureQueryData(queries.banking.personalMcpTokens()),
    ])
  },
  component: PersonalConnectionsPage,
})

function PersonalConnectionsPage() {
  const queryClient = useQueryClient()
  const { data: connections } = useSuspenseQuery(queries.banking.personalConnections())
  const { data: mcpAccess } = useSuspenseQuery(queries.banking.personalMcpTokens())
  const [country, setCountry] = useState('SE')
  const { data: providers } = useSuspenseQuery(queries.banking.personalBankProviders(country))
  const [providerName, setProviderName] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [tokenName, setTokenName] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)
  const visibleProviders = useMemo(() => {
    const filter = providerFilter.trim().toLocaleLowerCase('sv-SE')
    return filter
      ? providers.filter((provider) => provider.name.toLocaleLowerCase('sv-SE').includes(filter))
      : providers
  }, [providerFilter, providers])
  const startAuthorization = useMutation({
    ...mutations.banking.startEnableBankingAuthorization(),
    onSuccess: (result) => {
      window.location.href = result.url
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not connect bank')
    },
  })
  const setIncluded = useMutation({
    ...mutations.banking.setPersonalAccountIncluded(),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['banking', 'personal-connections'] }),
        queryClient.invalidateQueries({ queryKey: ['banking', 'personal-transactions'] }),
      ])
      toast.success(
        result.included
          ? `Account included; imported ${result.imported} transactions`
          : 'Account excluded from personal tracking',
      )
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update account')
    },
  })
  const disconnect = useMutation({
    ...mutations.banking.disconnectPersonalBankConnection(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['banking', 'personal-connections'] })
      toast.success('Bank disconnected; imported history was retained')
    },
  })
  const syncNow = useMutation({
    mutationFn: () => serverFns.jobs.syncBankingNow(),
    onSuccess: () => toast.success('Bank sync queued'),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not queue bank sync')
    },
  })
  const createMcpToken = useMutation({
    ...mutations.banking.createPersonalMcpToken(),
    onSuccess: async (result) => {
      setNewToken(result.token)
      setTokenName('')
      await queryClient.invalidateQueries({ queryKey: ['banking', 'personal-mcp-tokens'] })
      toast.success('Personal MCP token created')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create MCP token')
    },
  })
  const revokeMcpToken = useMutation({
    ...mutations.banking.revokePersonalMcpToken(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['banking', 'personal-mcp-tokens'] })
      toast.success('Personal MCP token revoked')
    },
  })

  function handleConnect(event: FormEvent) {
    event.preventDefault()
    if (!providerName) {
      return
    }

    startAuthorization.mutate({
      aspspName: providerName,
      aspspCountry: country,
      psuType: 'personal',
      workspaceKind: 'personal',
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Personal connections</h1>
          <p className="text-sm text-muted-foreground">
            Read-only bank access. Disconnecting never deletes imported history.
          </p>
        </div>
        <Button
          className="ml-auto"
          variant="outline"
          disabled={syncNow.isPending}
          onClick={() => syncNow.mutate()}
        >
          {syncNow.isPending ? 'Queueing…' : 'Sync now'}
        </Button>
      </div>

      {connections.some((connection) => isExpiringSoon(connection.consentValidUntil)) && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="py-4 text-sm">
            One or more bank consents expires within 14 days. Reconnect that bank to keep daily
            synchronization running.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          {connections.map((connection) => (
            <Card key={connection.id}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div>
                    <CardTitle>{connection.name.replace(/^Enable Banking /, '')}</CardTitle>
                    <CardDescription>
                      {connection.lastSyncedAt
                        ? `Last synced ${formatDateTime(connection.lastSyncedAt)}`
                        : 'Waiting for the first account sync'}
                    </CardDescription>
                  </div>
                  <Badge className="ml-auto" variant="outline">
                    {connection.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {connection.consentValidUntil && (
                  <p className="text-xs text-muted-foreground">
                    Consent valid until {formatDateTime(connection.consentValidUntil)}
                  </p>
                )}
                {connection.errorMessage && (
                  <p className="text-sm text-destructive">{connection.errorMessage}</p>
                )}
                <div className="divide-y border">
                  {connection.accounts.map((account) => (
                    <label
                      key={account.id}
                      htmlFor={`personal-account-${account.id}`}
                      className="flex cursor-pointer items-center gap-3 px-3 py-3"
                    >
                      <Checkbox
                        id={`personal-account-${account.id}`}
                        checked={account.included}
                        disabled={setIncluded.isPending || connection.status === 'disconnected'}
                        onCheckedChange={(checked) =>
                          setIncluded.mutate({
                            accountId: account.id,
                            included: checked === true,
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{account.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {account.currency}
                          {account.ibanSuffix ? ` · •••• ${account.ibanSuffix}` : ''}
                          {account.accountType ? ` · ${account.accountType}` : ''}
                        </span>
                      </span>
                      <span className="text-sm font-medium">
                        {formatMoney(account.currentBalance, account.currency)}
                      </span>
                    </label>
                  ))}
                  {connection.accounts.length === 0 && (
                    <p className="px-3 py-4 text-sm text-muted-foreground">
                      No accounts were returned by this consent.
                    </p>
                  )}
                </div>
                {connection.status !== 'disconnected' && (
                  <Button
                    className="self-start"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Disconnect this bank? Imported accounts and transactions will be retained.',
                        )
                      ) {
                        disconnect.mutate({ connectionId: connection.id })
                      }
                    }}
                  >
                    Disconnect
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
          {connections.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No personal banks connected yet.
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Add bank</CardTitle>
            <CardDescription>
              Choose any personal AIS provider available through Enable Banking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleConnect}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="provider-country">Country</FieldLabel>
                  <Input
                    id="provider-country"
                    maxLength={2}
                    value={country}
                    onChange={(event) => {
                      setCountry(event.target.value.toUpperCase())
                      setProviderName('')
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="provider-filter">Find bank</FieldLabel>
                  <Input
                    id="provider-filter"
                    placeholder="Nordea, Revolut…"
                    value={providerFilter}
                    onChange={(event) => setProviderFilter(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Provider</FieldLabel>
                  <Select value={providerName} onValueChange={setProviderName}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleProviders.map((provider) => (
                        <SelectItem
                          key={`${provider.country}:${provider.name}`}
                          value={provider.name}
                        >
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Button type="submit" disabled={!providerName || startAuthorization.isPending}>
                  {startAuthorization.isPending ? 'Opening bank…' : 'Continue to bank'}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal MCP access</CardTitle>
          <CardDescription>
            Create one read-only token per AI harness. Personal tokens can only read the accounts
            and transactions in this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {mcpAccess.endpoint && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">MCP endpoint</p>
              <code className="block overflow-x-auto border bg-muted/40 px-3 py-2 text-xs">
                {mcpAccess.endpoint}
              </code>
            </div>
          )}
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (tokenName.trim()) {
                createMcpToken.mutate({ name: tokenName })
              }
            }}
          >
            <Input
              className="max-w-sm"
              placeholder="Harness name, e.g. Claude Desktop"
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
            />
            <Button type="submit" disabled={!tokenName.trim() || createMcpToken.isPending}>
              Create token
            </Button>
          </form>

          {newToken && (
            <div className="border border-amber-500/50 bg-amber-500/5 p-3">
              <p className="mb-2 text-sm font-medium">Copy this token now</p>
              <p className="mb-3 text-xs text-muted-foreground">
                It is stored as a one-way hash and will not be shown again.
              </p>
              <div className="flex gap-2">
                <Input className="font-mono text-xs" readOnly value={newToken} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(newToken)
                    toast.success('Token copied')
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}

          <div className="divide-y border">
            {mcpAccess.tokens.map((token) => (
              <div key={token.id} className="flex items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{token.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {token.tokenPrefix}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {token.revokedAt
                      ? `Revoked ${formatDateTime(token.revokedAt)}`
                      : token.lastUsedAt
                        ? `Last used ${formatDateTime(token.lastUsedAt)}`
                        : 'Never used'}
                  </p>
                </div>
                {!token.revokedAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revokeMcpToken.isPending}
                    onClick={() => revokeMcpToken.mutate({ tokenId: token.id })}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
            {mcpAccess.tokens.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground">No personal MCP tokens yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function isExpiringSoon(value: string | null) {
  if (!value) {
    return false
  }

  return new Date(value).getTime() <= Date.now() + 14 * 24 * 60 * 60 * 1000
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatMoney(amount: string | null, currency: string) {
  if (amount === null) {
    return '—'
  }

  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
  }).format(Number(amount))
}
