type VectorMetadata = Record<string, string>

type Env = {
  AI: {
    run(model: string, input: { text: string[] }): Promise<{ data?: number[][] }>
  }
  VECTORIZE: {
    upsert(
      vectors: Array<{ id: string; values: number[]; metadata: VectorMetadata }>,
    ): Promise<unknown>
    query(
      vector: number[],
      options: {
        topK: number
        returnValues: boolean
        returnMetadata: 'none' | 'indexed' | 'all'
        filter: { workspaceId: { $eq: string } }
      },
    ): Promise<{ matches: Array<{ id: string; score: number }> }>
    deleteByIds(ids: string[]): Promise<unknown>
  }
  PERSONAL_SEARCH_API_TOKEN: string
}

const MODEL = '@cf/baai/bge-m3'

export default {
  async fetch(request: Request, env: Env) {
    if (!(await isAuthorized(request, env.PERSONAL_SEARCH_API_TOKEN))) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const url = new URL(request.url)
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    try {
      if (url.pathname === '/index') {
        const body = (await request.json()) as {
          transactionId: string
          text: string
          metadata: VectorMetadata
        }
        const vector = await embed(env, body.text)
        await env.VECTORIZE.upsert([
          {
            id: body.transactionId,
            values: vector,
            metadata: body.metadata,
          },
        ])
        return json({ indexed: true })
      }

      if (url.pathname === '/search') {
        const body = (await request.json()) as {
          query: string
          workspaceId: string
          limit: number
        }
        const vector = await embed(env, body.query)
        const result = await env.VECTORIZE.query(vector, {
          topK: Math.min(Math.max(body.limit, 1), 100),
          returnValues: false,
          returnMetadata: 'none',
          filter: { workspaceId: { $eq: body.workspaceId } },
        })
        return json({ matches: result.matches })
      }

      if (url.pathname === '/delete') {
        const body = (await request.json()) as { transactionIds: string[] }
        await env.VECTORIZE.deleteByIds(body.transactionIds)
        return json({ deleted: body.transactionIds.length })
      }

      return json({ error: 'Not found' }, 404)
    } catch (error) {
      console.error(error)
      return json({ error: 'Personal search request failed' }, 500)
    }
  },
}

async function embed(env: Env, text: string) {
  if (!text.trim()) {
    throw new Error('Cannot embed empty text')
  }

  const result = await env.AI.run(MODEL, { text: [text] })
  const vector = result.data?.[0]
  if (!vector?.length) {
    throw new Error('Workers AI returned an empty embedding')
  }

  return vector
}

async function isAuthorized(request: Request, expectedToken: string) {
  const header = request.headers.get('Authorization')
  const token = header?.match(/^Bearer ([^\s]+)$/i)?.[1]
  if (!token || !expectedToken) {
    return false
  }

  const [receivedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(expectedToken)),
  ])
  const received = new Uint8Array(receivedHash)
  const expected = new Uint8Array(expectedHash)
  let difference = received.length ^ expected.length
  for (let index = 0; index < Math.min(received.length, expected.length); index += 1) {
    difference |= received[index] ^ expected[index]
  }

  return difference === 0
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
