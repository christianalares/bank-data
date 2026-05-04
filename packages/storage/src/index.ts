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
  getSignedReadUrl(key: string, expiresInSeconds?: number): Promise<string>
  deleteObject(key: string): Promise<void>
}

export function createStorageClient(): StorageClient {
  const bucket = process.env.S3_BUCKET

  if (!bucket) {
    throw new Error('S3_BUCKET is required')
  }

  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'auto',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
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
