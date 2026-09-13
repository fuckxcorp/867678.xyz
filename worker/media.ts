import { HttpError } from "./http";
import type { Env, MediaRow } from "./platform";
import { signedS3Request } from "./s3";
import { randomId } from "./security";
import { getStorageConfig } from "./storage";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

function startsWith(bytes: Uint8Array, value: string): boolean {
  return value
    .split("")
    .every((char, index) => bytes[index] === char.charCodeAt(0));
}

function detectImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x89 && startsWith(bytes.slice(1), "PNG\r\n\x1a\n")) {
    return "image/png";
  }
  if (startsWith(bytes, "GIF87a") || startsWith(bytes, "GIF89a")) {
    return "image/gif";
  }
  if (startsWith(bytes, "RIFF") && startsWith(bytes.slice(8), "WEBP")) {
    return "image/webp";
  }
  if (
    startsWith(bytes.slice(4), "ftyp") &&
    new TextDecoder("ascii").decode(bytes.slice(8, 32)).includes("avif")
  ) {
    return "image/avif";
  }
  return null;
}

function extensionFor(contentType: string): string {
  return (
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/avif": "avif",
    }[contentType] ?? "bin"
  );
}

function safeFileName(value: string | null): string {
  const cleaned = (value ?? "image")
    .replace(/[/\\\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 120);
  return cleaned || "image";
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function mediaJson(row: MediaRow) {
  return {
    id: row.id,
    url: `/api/media/${encodeURIComponent(row.id)}`,
    alt: row.original_name,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
  };
}

export async function uploadMedia(request: Request, env: Env, userId: string) {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "MEDIA_TOO_LARGE", "Image cannot exceed 10 MB.");
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "MEDIA_TOO_LARGE", "Image cannot exceed 10 MB.");
  }
  const header = new Uint8Array(bytes.slice(0, 64));
  const contentType = detectImageType(header);
  if (!contentType || !ALLOWED_MEDIA.has(contentType)) {
    throw new HttpError(
      415,
      "UNSUPPORTED_MEDIA",
      "Only JPEG, PNG, GIF, WebP, and AVIF images are supported.",
    );
  }

  const config = await getStorageConfig(env, userId);
  if (!config) {
    throw new HttpError(
      400,
      "STORAGE_REQUIRED",
      "Configure S3-compatible storage first.",
    );
  }

  const objectKey = `users/${userId}/media/${randomId()}.${extensionFor(contentType)}`;
  const { response } = await signedS3Request(
    config,
    "PUT",
    objectKey,
    bytes,
    contentType,
  );
  if (!response.ok) {
    throw new HttpError(
      502,
      "MEDIA_UPLOAD_FAILED",
      `Media upload failed (S3 ${response.status}).`,
    );
  }

  const sha256 = await sha256Hex(bytes);
  const cacheKey = `media/${sha256}`;
  await env.MEDIA_CACHE.put(cacheKey, bytes, {
    httpMetadata: { contentType },
  });

  const id = randomId();
  const now = new Date().toISOString();
  const originalName = safeFileName(request.headers.get("X-File-Name"));
  await env.DB.prepare(
    `INSERT INTO media_objects (
       id, owner_id, object_key, original_name, content_type,
       sha256, byte_size, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`,
  )
    .bind(
      id,
      userId,
      objectKey,
      originalName,
      contentType,
      sha256,
      bytes.byteLength,
      now,
      now,
    )
    .run();

  return mediaJson({
    id,
    owner_id: userId,
    object_key: objectKey,
    original_name: originalName,
    content_type: contentType,
    sha256,
    byte_size: bytes.byteLength,
    status: "ready",
    created_at: now,
    updated_at: now,
  });
}

async function getMediaRow(env: Env, id: string): Promise<MediaRow> {
  const row = await env.DB.prepare(
    "SELECT * FROM media_objects WHERE id = ? AND status = 'ready'",
  )
    .bind(id)
    .first<MediaRow>();
  if (!row) throw new HttpError(404, "MEDIA_NOT_FOUND", "Media not found.");
  return row;
}

export async function getMedia(
  env: Env,
  id: string,
): Promise<{
  body: ReadableStream | ArrayBuffer;
  contentType: string;
  size: number;
  etag: string;
}> {
  const row = await getMediaRow(env, id);
  const cacheKey = `media/${row.sha256}`;
  const cached = await env.MEDIA_CACHE.get(cacheKey);
  if (cached) {
    return {
      body: cached.body,
      contentType: cached.httpMetadata?.contentType ?? row.content_type,
      size: cached.size,
      etag: row.sha256,
    };
  }

  const config = await getStorageConfig(env, row.owner_id);
  if (!config) {
    throw new HttpError(
      502,
      "STORAGE_UNAVAILABLE",
      "The media source storage is unavailable.",
    );
  }
  const { response } = await signedS3Request(config, "GET", row.object_key);
  if (!response.ok) {
    throw new HttpError(
      502,
      "MEDIA_FETCH_FAILED",
      `Media fetch failed (S3 ${response.status}).`,
    );
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError(
      502,
      "MEDIA_TOO_LARGE",
      "Source media exceeds the size limit.",
    );
  }
  const detected = detectImageType(new Uint8Array(bytes.slice(0, 64)));
  if (!detected || detected !== row.content_type) {
    throw new HttpError(
      502,
      "MEDIA_CHANGED",
      "Source media content has changed.",
    );
  }
  await env.MEDIA_CACHE.put(cacheKey, bytes, {
    httpMetadata: { contentType: detected },
  });
  return {
    body: bytes,
    contentType: detected,
    size: bytes.byteLength,
    etag: row.sha256,
  };
}
