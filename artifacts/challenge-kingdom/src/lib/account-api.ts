import type { ChildContentConfig } from "./child-content";

export type MemberRole = "owner" | "child";

export type FamilySummary = {
  id: string;
  name: string;
  username: string | null;
  memberCount: number;
};

export type FamilyMember = {
  id: string;
  role: MemberRole;
  name: string;
  grade?: string;
  title?: string;
  quote?: string;
  color?: string;
};

export type Family = Pick<FamilySummary, "id" | "name" | "username">;

export type AdminSession = {
  token: string;
  expiresAt: string;
};
export type MemberSession = {
  ok: true;
  role: MemberRole;
  token: string;
  expiresAt: string;
};

type ApiErrorBody = { error?: string; message?: string };

export class AccountApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AccountApiError";
    this.status = status;
  }
}

export function isFamilySessionFailure(error: unknown): error is AccountApiError {
  return error instanceof AccountApiError && error.status === 404;
}

const accountApiUrl = import.meta.env.VITE_ACCOUNTS_API_URL?.trim()
  || "/api/accounts";

function endpoint(action: string, query?: Record<string, string | undefined>) {
  const params = new URLSearchParams({ action });
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, value);
  });
  return `${accountApiUrl}${accountApiUrl.includes("?") ? "&" : "?"}${params}`;
}

async function request<T>(
  action: string,
  options: { method?: "GET" | "POST"; body?: unknown; token?: string; query?: Record<string, string | undefined>; familyCode?: string; familyUsername?: string } = {},
) {
  const response = await fetch(endpoint(action, options.query), {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.familyCode ? { "x-family-code": options.familyCode } : {}),
      ...(options.familyUsername ? { "x-family-username": options.familyUsername } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json() as ApiErrorBody;
      detail = payload.error || payload.message || "";
    } catch {
      // A status-specific message below is useful even when a proxy returns HTML.
    }
    throw new AccountApiError(detail || `تعذر إتمام الطلب (${response.status}).`, response.status);
  }
  return response.json() as Promise<T>;
}

export const accountsApi = {
  revealAdmin: (code: string) => request<AdminSession & { ok: true }>("admin-reveal", { method: "POST", body: { code } }),
  adminFamilies: (token: string) => request<{ families: FamilySummary[] }>("admin-families", { token }),
  createFamily: (token: string, name: string, username: string, code: string) =>
    request<{ family: Family }>("admin-create-family", { method: "POST", token, body: { name, username, code } }),
  adminMembers: (token: string, familyId: string) =>
    request<{ family: Family; members: FamilyMember[] }>("admin-members", { token, query: { familyId } }),
  adminContent: (token: string, familyId: string) =>
    request<{ content: ChildContentConfig | null }>("admin-content", { token, query: { familyId } }),
  saveAdminContent: (token: string, familyId: string, content: ChildContentConfig) =>
    request<{ content: ChildContentConfig }>("admin-content", { method: "POST", token, body: { familyId, content } }),
  createMember: (token: string, input: {
    familyId: string; role: MemberRole; name: string; grade?: string; title?: string; quote?: string; color?: string;
  }) => request<unknown>("admin-create-member", { method: "POST", token, body: input }),
  deleteMember: (token: string, familyId: string, memberId: string) =>
    request<unknown>("admin-delete-member", { method: "POST", token, body: { familyId, memberId, confirm: true } }),
  changeFamilyCode: (token: string, familyId: string, newCode: string) =>
    request<unknown>("admin-change-family-code", { method: "POST", token, body: { familyId, newCode } }),
  changeFamilyName: (token: string, familyId: string, name: string) =>
    request<unknown>("admin-change-family-name", { method: "POST", token, body: { familyId, name } }),
  changeFamilyUsername: (token: string, familyId: string, username: string) =>
    request<unknown>("admin-change-family-username", { method: "POST", token, body: { familyId, username } }),
  changeAdminCode: (token: string, newCode: string) =>
    request<unknown>("admin-change-code", { method: "POST", token, body: { newCode } }),
  deleteFamily: (token: string, familyId: string) =>
    request<unknown>("admin-delete-family", { method: "POST", token, body: { familyId, confirm: true } }),
  familyMembers: (familyUsername: string, familyCode: string) =>
    request<{ family: Family; members: FamilyMember[] }>("family-members", { familyUsername, familyCode }),
  bootstrapFamily: (familyUsername: string, familyCode: string) =>
    request<{ family: Family }>("bootstrap-family", { method: "POST", familyUsername, familyCode }),
  verifyMember: (familyUsername: string, familyCode: string, memberId: string, code: string, role?: MemberRole) =>
    request<MemberSession>("verify-member", { method: "POST", familyUsername, familyCode, body: { memberId, code, role } }),
};