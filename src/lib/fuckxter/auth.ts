import { ApiError, apiRequest } from "./http";
import type { FeedUser } from "./types";

export interface Account {
  profile: {
    name: string;
    handle: string;
    bio: string;
    email: string;
    region: string;
    gender: string;
    birthday: string;
  };
  twoFactorEnabled: boolean;
  recoveryCodeCount: number;
  createdAt: string;
}

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathStyle: boolean;
}

interface AccountResponse {
  account: Account | null;
}

export const AUTH_REQUIRED_EVENT = "fk:auth-required";

let account: Account | null = null;
let sessionPromise: Promise<Account | null> | null = null;

function normalizeAccount(value: Account): Account {
  return {
    ...value,
    recoveryCodeCount: value.recoveryCodeCount ?? 0,
  };
}

export function getAccount(): Account | null {
  return account;
}

function setAccount(next: Account | null): void {
  account = next;
}

export function hydrateSession(force = false): Promise<Account | null> {
  if (!force && sessionPromise) return sessionPromise;

  sessionPromise = apiRequest<AccountResponse>("/api/auth/me")
    .then((response) => {
      setAccount(response.account ? normalizeAccount(response.account) : null);
      return account;
    })
    .catch((error: unknown) => {
      if (!(error instanceof ApiError) || error.status !== 401) {
        console.error("FuckXter session bootstrap failed", error);
      }
      setAccount(null);
      return null;
    });

  return sessionPromise;
}

export function toFeedUser(value: Account | null): FeedUser {
  if (!value) return { id: "guest", name: "访客", handle: "guest" };
  return {
    id: `self-${value.profile.handle}`,
    name: value.profile.name,
    handle: value.profile.handle,
  };
}

export function requestAuthentication(): void {
  window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
}

export async function signIn(input: {
  identifier: string;
  password: string;
  code?: string;
}): Promise<Account> {
  const response = await apiRequest<AccountResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.account) throw new ApiError("登录响应缺少账号信息");
  const next = normalizeAccount(response.account);
  setAccount(next);
  sessionPromise = Promise.resolve(next);
  return next;
}

export async function signOut(): Promise<void> {
  try {
    await apiRequest<void>("/api/auth/logout", { method: "POST" });
  } finally {
    setAccount(null);
    sessionPromise = Promise.resolve(null);
  }
}

export async function updateProfile(input: {
  name: string;
  bio: string;
  region: string;
  gender: string;
  birthday: string;
}): Promise<Account> {
  const response = await apiRequest<AccountResponse>("/api/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!response.account) throw new ApiError("资料响应缺少账号信息");
  const next = normalizeAccount(response.account);
  setAccount(next);
  return next;
}

export async function changeEmail(input: {
  email: string;
  password: string;
}): Promise<Account> {
  const response = await apiRequest<AccountResponse>("/api/me/email", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  if (!response.account) throw new ApiError("邮箱响应缺少账号信息");
  const next = normalizeAccount(response.account);
  setAccount(next);
  return next;
}

export async function changePassword(input: {
  current: string;
  next: string;
}): Promise<void> {
  await apiRequest<void>("/api/me/password", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function beginTwoFactor(): Promise<{ secret: string }> {
  return apiRequest<{ secret: string }>("/api/me/2fa/setup", {
    method: "POST",
  });
}

export async function confirmTwoFactor(code: string): Promise<Account> {
  const response = await apiRequest<AccountResponse>("/api/me/2fa/confirm", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!response.account) throw new ApiError("2FA 响应缺少账号信息");
  const next = normalizeAccount(response.account);
  setAccount(next);
  return next;
}

export async function generateRecoveryCodes(): Promise<{
  codes: string[];
  recoveryCodeCount: number;
}> {
  const response = await apiRequest<{
    codes: string[];
    recoveryCodeCount: number;
  }>("/api/me/2fa/recovery-codes", {
    method: "POST",
  });
  if (account) {
    setAccount({ ...account, recoveryCodeCount: response.recoveryCodeCount });
  }
  return response;
}

export async function getS3Config(): Promise<S3Config | null> {
  const response = await apiRequest<{ config: S3Config | null }>(
    "/api/me/storage",
  );
  return response.config;
}

export async function saveS3Config(config: S3Config): Promise<S3Config> {
  const response = await apiRequest<{ config: S3Config }>("/api/me/storage", {
    method: "PUT",
    body: JSON.stringify(config),
  });
  return response.config;
}

export async function testS3Connection(config: S3Config): Promise<string> {
  const response = await apiRequest<{ message: string }>(
    "/api/me/storage/test",
    {
      method: "POST",
      body: JSON.stringify(config),
    },
  );
  return response.message;
}
