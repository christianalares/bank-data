import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export type PutObjectInput = {
  key: string
  body: Uint8Array | Buffer | string
  contentType?: string
}

export type StorageClient = {
  putObject(input: PutObjectInput): Promise<void>
  getObjectBytes(key: string): Promise<Buffer>
  getSignedReadUrl(key: string, expiresInSeconds?: number): Promise<string>
  deleteObject(key: string): Promise<void>
}

export function createStorageClient(): StorageClient {
  const bucket = process.env.AWS_S3_BUCKET_NAME
  const endpoint = process.env.AWS_ENDPOINT_URL
  const region = process.env.AWS_DEFAULT_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!bucket) {
    throw new Error('AWS_S3_BUCKET_NAME is required')
  }
  if (!endpoint) {
    throw new Error('AWS_ENDPOINT_URL is required')
  }
  if (!region) {
    throw new Error('AWS_DEFAULT_REGION is required')
  }
  if (!accessKeyId) {
    throw new Error('AWS_ACCESS_KEY_ID is required')
  }
  if (!secretAccessKey) {
    throw new Error('AWS_SECRET_ACCESS_KEY is required')
  }

  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  })

  return {
    async putObject(input) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }),
      )
    },
    async getObjectBytes(key) {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      )

      if (!response.Body) {
        throw new Error(`Storage object not found: ${key}`)
      }

      const chunks: Uint8Array[] = []

      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk)
      }

      return Buffer.concat(chunks)
    },
    async getSignedReadUrl(key, expiresInSeconds = 60 * 15) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
        { expiresIn: expiresInSeconds },
      )
    },
    async deleteObject(key) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      )
    },
  }
}
