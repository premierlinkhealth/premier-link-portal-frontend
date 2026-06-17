// API client. Every call attaches the current user's Identity Platform ID token
// as a Bearer header; the backend verifies it and enforces role permissions.

import { auth } from "./firebase";

const BASE = (import.meta.env.VITE_API_BASE_URL as string) || "";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function handle(res: Response) {
  if (res.status === 204) return null;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error || `Request failed (${res.status})`);
  }
  return body;
}

export async function apiGet(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { ...(await authHeader()) } });
  return handle(res);
}

export async function apiSend(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle(res);
}

export const apiPost = (p: string, b?: unknown) => apiSend("POST", p, b);
export const apiPut = (p: string, b?: unknown) => apiSend("PUT", p, b);
export const apiPatch = (p: string, b?: unknown) => apiSend("PATCH", p, b);

// Downloads the generated assessment PDF (auth-protected) as a blob.
export async function apiDownloadPdf(assessmentId: string): Promise<Blob> {
  const res = await fetch(`${BASE}/api/assessments/${assessmentId}/pdf`, {
    headers: { ...(await authHeader()) },
  });
  if (!res.ok) throw new ApiError(res.status, "Could not download PDF");
  return res.blob();
}

export const sessionPolicy = () => apiGet("/api/session-policy");
