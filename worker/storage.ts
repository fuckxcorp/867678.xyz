import { HttpError } from "./http";
import type { Env } from "./platform";
import type { S3Config } from "./s3";
import { decryptSecret, encryptSecret } from "./security";

export async function getStorageConfig(
  env: Env,
  userId: string,
): Promise<S3Config | null> {
  const row = await env.DB.prepare("SELECT * FROM s3_configs WHERE user_id = ?")
    .bind(userId)
    .first<{
      endpoint: string;
      region: string;
      bucket: string;
      access_key_id: string;
      secret_ciphertext: string;
      path_style: number;
    }>();
  if (!row) return null;
  return {
    endpoint: row.endpoint,
    region: row.region,
    bucket: row.bucket,
    accessKeyId: row.access_key_id,
    secretAccessKey: await decryptSecret(row.secret_ciphertext, env),
    pathStyle: Boolean(row.path_style),
  };
}

export async function saveStorageConfig(
  env: Env,
  userId: string,
  input: S3Config,
): Promise<S3Config | null> {
  const endpoint = input.endpoint?.trim() ?? "";
  const region = input.region?.trim() || "auto";
  const bucket = input.bucket?.trim() ?? "";
  const accessKeyId = input.accessKeyId?.trim() ?? "";
  if (!/^https?:\/\//.test(endpoint)) {
    throw new HttpError(
      400,
      "INVALID_ENDPOINT",
      "Endpoint must start with http(s)://.",
    );
  }
  if (!bucket)
    throw new HttpError(400, "BUCKET_REQUIRED", "Bucket is required.");

  const existing = await env.DB.prepare(
    "SELECT secret_ciphertext FROM s3_configs WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ secret_ciphertext: string }>();
  const suppliedSecret = input.secretAccessKey ?? "";
  const secretCiphertext = suppliedSecret
    ? await encryptSecret(suppliedSecret, env)
    : existing?.secret_ciphertext;
  if (!secretCiphertext) {
    throw new HttpError(
      400,
      "SECRET_REQUIRED",
      "Secret Access Key is required.",
    );
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO s3_configs (
       user_id, endpoint, region, bucket, access_key_id,
       secret_ciphertext, path_style, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       endpoint = excluded.endpoint,
       region = excluded.region,
       bucket = excluded.bucket,
       access_key_id = excluded.access_key_id,
       secret_ciphertext = excluded.secret_ciphertext,
       path_style = excluded.path_style,
       updated_at = excluded.updated_at`,
  )
    .bind(
      userId,
      endpoint,
      region,
      bucket,
      accessKeyId,
      secretCiphertext,
      input.pathStyle ? 1 : 0,
      now,
      now,
    )
    .run();
  return getStorageConfig(env, userId);
}
