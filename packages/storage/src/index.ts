import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ──────────────── Storage Key Conventions ────────────────
// All keys are workspace-scoped: {tenantId}/{workspaceId}/{category}/...
// This ensures tenant and workspace isolation at the storage layer.

export const STORAGE_CATEGORIES = {
  RECORDINGS: 'recordings',
  GENERATED_TESTS: 'generated-tests',
  ARTIFACTS: 'artifacts',
  REPAIR_PATCHES: 'repair-patches',
} as const;

export type StorageCategory = (typeof STORAGE_CATEGORIES)[keyof typeof STORAGE_CATEGORIES];

export interface StorageKeyParts {
  tenantId: string;
  workspaceId: string;
  category: StorageCategory;
  fileName: string;
}

/** Build a workspace-scoped storage key: {tenantId}/{workspaceId}/{category}/{fileName} */
export function buildStorageKey(parts: StorageKeyParts): string {
  return `${parts.tenantId}/${parts.workspaceId}/${parts.category}/${parts.fileName}`;
}

/** Build an artifact-specific key with run context */
export function buildArtifactKey(
  tenantId: string,
  workspaceId: string,
  testRunId: string,
  itemId: string,
  artifactType: string,
  fileName: string,
): string {
  return `${tenantId}/${workspaceId}/${STORAGE_CATEGORIES.ARTIFACTS}/${testRunId}/${itemId}/${artifactType}/${fileName}`;
}

/** Build a repair patch key */
export function buildRepairPatchKey(
  tenantId: string,
  workspaceId: string,
  generatedTestArtifactId: string,
  attemptNumber: number,
  fileName: string,
): string {
  return `${tenantId}/${workspaceId}/${STORAGE_CATEGORIES.REPAIR_PATCHES}/${generatedTestArtifactId}/attempt-${attemptNumber}/${fileName}`;
}

export interface StorageConfig {
  driver: 's3' | 'local';
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  localDir: string;
  /** Use IAM role credentials (no explicit keys). True on AWS (ECS/App Runner). */
  useIamAuth: boolean;
}

export function createStorageClient(config: StorageConfig): S3Client {
  if (config.useIamAuth) {
    // On AWS, the SDK automatically resolves credentials from the IAM role
    return new S3Client({
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? false,
    });
  }

  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle ?? true,
  });
}

export function getStorageConfig(): StorageConfig {
  const useIamAuth = !process.env['S3_ACCESS_KEY'] && !process.env['S3_SECRET_KEY'];
  return {
    driver: process.env['STORAGE_DRIVER'] === 'local' ? 'local' : 's3',
    endpoint: process.env['S3_ENDPOINT'] ?? 'http://localhost:9000',
    region: process.env['S3_REGION'] ?? 'us-east-1',
    bucket: process.env['S3_BUCKET'] ?? 'selora-artifacts',
    accessKeyId: process.env['S3_ACCESS_KEY'] ?? '',
    secretAccessKey: process.env['S3_SECRET_KEY'] ?? '',
    forcePathStyle:
      process.env['S3_FORCE_PATH_STYLE'] === undefined
        ? !useIamAuth
        : process.env['S3_FORCE_PATH_STYLE'] === 'true',
    localDir: process.env['LOCAL_STORAGE_DIR'] ?? path.resolve(process.cwd(), '.tmp/storage'),
    useIamAuth,
  };
}

export async function ensureStorageReady(config: StorageConfig, client?: S3Client) {
  if (config.driver === 'local') {
    await mkdir(config.localDir, { recursive: true });
    return;
  }

  if (!client) {
    throw new Error('S3 client is required for S3 storage.');
  }

  await ensureBucketExists(client, config.bucket);
}

export async function ensureBucketExists(client: S3Client, bucket: string) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export async function putObjectBuffer(input: {
  client: S3Client;
  bucket: string;
  key: string;
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}) {
  await input.client.send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      Metadata: input.metadata,
    }),
  );
}

export async function putStoredObject(input: {
  config: StorageConfig;
  key: string;
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}) {
  if (input.config.driver === 'local') {
    const filePath = path.join(input.config.localDir, input.key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body);
    return;
  }

  const client = createStorageClient(input.config);
  await ensureStorageReady(input.config, client);
  await putObjectBuffer({
    client,
    bucket: input.config.bucket,
    key: input.key,
    body: input.body,
    contentType: input.contentType,
    metadata: input.metadata,
  });
}

export async function getObject(input: { client: S3Client; bucket: string; key: string }) {
  return input.client.send(
    new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
    }),
  );
}

export async function readStoredText(input: { config: StorageConfig; key: string }) {
  if (input.config.driver === 'local') {
    const filePath = path.join(input.config.localDir, input.key);
    return readFile(filePath, 'utf8');
  }

  const client = createStorageClient(input.config);
  await ensureStorageReady(input.config, client);
  const response = await getObject({ client, bucket: input.config.bucket, key: input.key });
  return response.Body?.transformToString() ?? '';
}

export async function readStoredBuffer(input: { config: StorageConfig; key: string }) {
  if (input.config.driver === 'local') {
    const filePath = path.join(input.config.localDir, input.key);
    return readFile(filePath);
  }

  const client = createStorageClient(input.config);
  await ensureStorageReady(input.config, client);
  const response = await getObject({ client, bucket: input.config.bucket, key: input.key });
  const bytes = await response.Body?.transformToByteArray();
  return Buffer.from(bytes ?? []);
}

export async function deleteStoredObject(input: { config: StorageConfig; key: string }) {
  if (input.config.driver === 'local') {
    const filePath = path.join(input.config.localDir, input.key);
    await unlink(filePath).catch(() => {});
    return;
  }

  const client = createStorageClient(input.config);
  await ensureStorageReady(input.config, client);
  await client.send(
    new DeleteObjectCommand({
      Bucket: input.config.bucket,
      Key: input.key,
    }),
  );
}
