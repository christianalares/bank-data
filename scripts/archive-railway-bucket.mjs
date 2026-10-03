import { createHash } from 'node:crypto'
import { mkdir, open, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

const root = process.argv[2]
if (!root || !path.isAbsolute(root)) throw new Error('Absolute archive path required')

const bucket = process.env.AWS_S3_BUCKET_NAME
const endpoint = process.env.AWS_ENDPOINT_URL
const region = process.env.AWS_DEFAULT_REGION
const accessKeyId = process.env.AWS_ACCESS_KEY_ID
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
if (!bucket || !endpoint || !region || !accessKeyId || !secretAccessKey) {
  throw new Error('Railway bucket variables are unavailable')
}

const partial = `${root}.partial`
await mkdir(path.dirname(root), { recursive: true, mode: 0o700 })
await mkdir(partial, { mode: 0o700 })
await mkdir(path.join(partial, 'objects'), { mode: 0o700 })

const client = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
})

const manifest = []
let cursor
do {
  const page = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: cursor }),
  )
  for (const listed of page.Contents ?? []) {
    if (!listed.Key) throw new Error('Bucket listed an object without a key')
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: listed.Key }))
    if (!response.Body) throw new Error('Bucket object has no body')
    const chunks = []
    for await (const chunk of response.Body) chunks.push(chunk)
    const bytes = Buffer.concat(chunks)
    if (listed.Size != null && bytes.length !== listed.Size)
      throw new Error('Bucket object size mismatch')
    const keyHash = createHash('sha256').update(listed.Key).digest('hex')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    await writeFile(path.join(partial, 'objects', keyHash), bytes, { flag: 'wx', mode: 0o600 })
    manifest.push({
      key: listed.Key,
      keyHash,
      sha256,
      sizeBytes: bytes.length,
      contentType: response.ContentType ?? null,
    })
  }
  cursor = page.IsTruncated ? page.NextContinuationToken : undefined
  if (page.IsTruncated && !cursor) throw new Error('Bucket pagination ended without a cursor')
} while (cursor)

manifest.sort((a, b) => a.key.localeCompare(b.key))
const manifestBytes = Buffer.from(`${manifest.map((x) => JSON.stringify(x)).join('\n')}\n`)
await writeFile(path.join(partial, 'manifest.jsonl'), manifestBytes, { flag: 'wx', mode: 0o600 })
const file = await open(path.join(partial, 'manifest.jsonl'), 'r')
await file.sync()
await file.close()
await rename(partial, root)
console.log(
  JSON.stringify({
    objects: manifest.length,
    totalBytes: manifest.reduce((sum, x) => sum + x.sizeBytes, 0),
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  }),
)
