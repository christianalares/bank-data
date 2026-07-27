type VectorMatch = {
  id?: string
  score?: number
}

export function isPersonalSemanticSearchConfigured() {
  return Boolean(
    process.env.PERSONAL_SEARCH_SERVICE_URL?.trim() &&
      process.env.PERSONAL_SEARCH_API_TOKEN?.trim(),
  )
}

export async function upsertPersonalTransactionVector(input: {
  transactionId: string
  text: string
  metadata: {
    workspaceId: string
    accountId: string
    bookedAt: string
    currency: string
    direction: 'credit' | 'debit'
  }
}) {
  if (!isPersonalSemanticSearchConfigured()) {
    return { indexed: false as const, reason: 'not_configured' as const }
  }

  await personalSearchRequest('/index', input)
  return { indexed: true as const }
}

export async function searchPersonalTransactionVectors(input: {
  query: string
  workspaceId: string
  limit: number
}) {
  if (!isPersonalSemanticSearchConfigured()) {
    return [] as Array<{ id: string; score: number }>
  }

  const result = await personalSearchRequest<{ matches?: VectorMatch[] }>('/search', input)

  return (result.matches ?? []).filter(
    (match): match is { id: string; score: number } =>
      typeof match.id === 'string' && typeof match.score === 'number',
  )
}

export async function deletePersonalTransactionVectors(transactionIds: string[]) {
  if (!isPersonalSemanticSearchConfigured() || transactionIds.length === 0) {
    return
  }

  await personalSearchRequest('/delete', { transactionIds })
}

async function personalSearchRequest<TResult = unknown>(
  path: string,
  body: unknown,
): Promise<TResult> {
  const serviceUrl = process.env.PERSONAL_SEARCH_SERVICE_URL?.trim().replace(/\/$/, '')
  const apiToken = process.env.PERSONAL_SEARCH_API_TOKEN?.trim()
  if (!serviceUrl || !apiToken) {
    throw new Error('Personal semantic search service is not configured')
  }

  const response = await fetch(`${serviceUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Personal semantic search request failed (${response.status})`)
  }

  return response.json() as Promise<TResult>
}
