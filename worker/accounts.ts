import { HttpError } from "./http";
import type { Env, UserRow } from "./platform";
import {
  accountFromRow,
  createPasswordHash,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  randomId,
  randomRecoveryCode,
  recoverableCodeHash,
  verifyPassword,
  verifyTotp,
} from "./security";

const RESERVED_HANDLES = new Set(["user", "post", "settings", "api", "assets"]);

function handleFromEmail(email: string): string {
  const base = email
    .split("@")[0]
    .replace(/[^a-z0-9_]/gi, "")
    .toLowerCase()
    .slice(0, 20);
  if (/^[a-z0-9_]{2,20}$/.test(base) && !RESERVED_HANDLES.has(base)) {
    return base;
  }
  return `guest${randomId().replace(/-/g, "").slice(0, 8)}`;
}

async function findUserByIdentifier(
  env: Env,
  identifier: string,
): Promise<UserRow | null> {
  return env.DB.prepare(
    "SELECT * FROM users WHERE email = ? COLLATE NOCASE OR handle = ? COLLATE NOCASE LIMIT 1",
  )
    .bind(identifier, identifier)
    .first<UserRow>();
}

async function getAccount(env: Env, userId: string) {
  const row = await env.DB.prepare(
    `SELECT u.*,
       (SELECT COUNT(*) FROM recovery_codes rc
        WHERE rc.user_id = u.id AND rc.used_at IS NULL) AS recovery_code_count
     FROM users u
     WHERE u.id = ?`,
  )
    .bind(userId)
    .first<UserRow & { recovery_code_count: number }>();
  if (!row) throw new HttpError(404, "USER_NOT_FOUND", "用户不存在。");
  return accountFromRow(row);
}

export async function loginOrRegister(
  env: Env,
  identifierValue: string,
  password: string,
  code?: string,
) {
  const identifier = identifierValue.trim().replace(/^@/, "").toLowerCase();
  if (!identifier) throw new HttpError(400, "EMAIL_REQUIRED", "请输入邮箱。");
  if (!password) throw new HttpError(400, "PASSWORD_REQUIRED", "请输入密码。");

  let user = await findUserByIdentifier(env, identifier);
  if (user) {
    if (!(await verifyPassword(password, user))) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "邮箱或密码错误。");
    }
    if (user.two_factor_enabled) {
      if (!code?.trim()) {
        throw new HttpError(
          428,
          "TWO_FACTOR_REQUIRED",
          "请输入验证器 App 的动态验证码。",
        );
      }
      const secret = await decryptSecret(user.totp_secret ?? "", env);
      if (!(await verifyTotp(secret, code.trim()))) {
        throw new HttpError(401, "INVALID_TOTP", "动态验证码不正确。");
      }
    }
    return { userId: user.id, account: await getAccount(env, user.id) };
  }

  const email = identifier.includes("@")
    ? identifier
    : `${identifier}@local.invalid`;
  const handle = handleFromEmail(email);
  const id = randomId();
  const now = new Date().toISOString();
  const passwordValue = await createPasswordHash(password);
  try {
    await env.DB.prepare(
      `INSERT INTO users (
         id, handle, email, password_hash, password_salt, name, verified,
         bio, region, gender, birthday, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 0, '', '', '', '', ?, ?)`,
    )
      .bind(
        id,
        handle,
        email,
        passwordValue.hash,
        passwordValue.salt,
        handle,
        now,
        now,
      )
      .run();
  } catch {
    throw new HttpError(409, "IDENTIFIER_EXISTS", "邮箱或用户名已经被使用。");
  }
  user = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(id)
    .first<UserRow>();
  if (!user) throw new HttpError(500, "USER_CREATE_FAILED", "注册失败。");
  return { userId: user.id, account: await getAccount(env, user.id) };
}

export async function updateProfile(
  env: Env,
  userId: string,
  input: {
    name?: string;
    bio?: string;
    region?: string;
    gender?: string;
    birthday?: string;
  },
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE users
     SET name = ?, bio = ?, region = ?, gender = ?, birthday = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      input.name?.trim() || "用户",
      input.bio?.trim() ?? "",
      input.region?.trim() ?? "",
      input.gender?.trim() ?? "",
      input.birthday?.trim() ?? "",
      now,
      userId,
    )
    .run();
  return getAccount(env, userId);
}

export async function changeEmail(
  env: Env,
  userId: string,
  emailValue: string,
  password: string,
) {
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "请先登录。");
  if (!(await verifyPassword(password, user))) {
    throw new HttpError(403, "INVALID_PASSWORD", "当前密码不正确。");
  }
  const email = emailValue.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, "INVALID_EMAIL", "邮箱格式不正确。");
  }
  try {
    await env.DB.prepare(
      "UPDATE users SET email = ?, updated_at = ? WHERE id = ?",
    )
      .bind(email, new Date().toISOString(), userId)
      .run();
  } catch {
    throw new HttpError(409, "EMAIL_EXISTS", "该邮箱已经被使用。");
  }
  return getAccount(env, userId);
}

export async function changePassword(
  env: Env,
  userId: string,
  current: string,
  next: string,
): Promise<void> {
  if ([...next].length < 8) {
    throw new HttpError(400, "PASSWORD_TOO_SHORT", "新密码至少 8 位。");
  }
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "请先登录。");
  if (!(await verifyPassword(current, user))) {
    throw new HttpError(403, "INVALID_PASSWORD", "当前密码不正确。");
  }
  const passwordValue = await createPasswordHash(next);
  await env.DB.prepare(
    `UPDATE users
     SET password_hash = ?, password_salt = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      passwordValue.hash,
      passwordValue.salt,
      new Date().toISOString(),
      userId,
    )
    .run();
}

export async function beginTwoFactor(env: Env, userId: string) {
  const secret = generateTotpSecret();
  await env.DB.prepare(
    `UPDATE users
     SET totp_secret = ?, two_factor_enabled = 0, updated_at = ?
     WHERE id = ?`,
  )
    .bind(await encryptSecret(secret, env), new Date().toISOString(), userId)
    .run();
  return { secret };
}

export async function confirmTwoFactor(env: Env, userId: string, code: string) {
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
  if (!user?.totp_secret) {
    throw new HttpError(400, "TOTP_NOT_STARTED", "请先开始绑定验证器。");
  }
  const secret = await decryptSecret(user.totp_secret, env);
  if (!(await verifyTotp(secret, code.trim()))) {
    throw new HttpError(400, "INVALID_TOTP", "动态验证码不正确。");
  }
  await env.DB.prepare(
    `UPDATE users
     SET two_factor_enabled = 1, updated_at = ?
     WHERE id = ?`,
  )
    .bind(new Date().toISOString(), userId)
    .run();
  return { account: await getAccount(env, userId) };
}

export async function replaceRecoveryCodes(env: Env, userId: string) {
  const user = await env.DB.prepare(
    "SELECT two_factor_enabled FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<Pick<UserRow, "two_factor_enabled">>();
  if (!user?.two_factor_enabled) {
    throw new HttpError(400, "TOTP_REQUIRED", "请先开启两步验证。");
  }
  const codes = Array.from({ length: 8 }, randomRecoveryCode);
  const now = new Date().toISOString();
  const hashes = await Promise.all(
    codes.map((code) => recoverableCodeHash(env, code)),
  );
  await env.DB.batch([
    env.DB.prepare("DELETE FROM recovery_codes WHERE user_id = ?").bind(userId),
    ...codes.map((_, index) =>
      env.DB.prepare(
        `INSERT INTO recovery_codes (id, user_id, code_hash, created_at)
           VALUES (?, ?, ?, ?)`,
      ).bind(randomId(), userId, hashes[index], now),
    ),
  ]);
  return { codes, recoveryCodeCount: codes.length };
}
