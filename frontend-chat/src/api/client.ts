const resolveApiBase = () => {
  const { protocol, hostname } = window.location;
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (configured && !configured.includes('127.0.0.1') && !configured.includes('localhost')) {
      return configured;
    }
    return `${protocol}//${hostname}:8000`;
  }

  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  return 'http://127.0.0.1:8000';
};

export const API_BASE = resolveApiBase();

export const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant_demo';
export const USER_ID = import.meta.env.VITE_USER_ID || 'user_demo';
export const SHOW_DEBUG = import.meta.env.VITE_SHOW_DEBUG === 'true';
const AUTH_STORAGE_KEY = 'skill_agent_auth';

export type AuthUser = {
  id: string;
  tenant_id: string;
  username: string;
  display_name?: string;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

export type ChatStreamEvent = {
  event: 'status' | 'stream_delta' | 'stream_end' | 'complete' | 'token' | 'done' | 'error' | string;
  data: Record<string, unknown>;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function getAuthSession(): AuthSession | null {
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.token || !parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAuthSession(session: AuthSession): void {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function authHeader(): Record<string, string> {
  const session = getAuthSession();
  return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
}

export async function streamChatTurn(
  body: Record<string, unknown>,
  onEvent: (item: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  if (!response.body) {
    throw new Error('当前浏览器不支持流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
    blocks.forEach((block) => {
      const parsed = parseSseBlock(block);
      if (parsed) onEvent(parsed);
    });
  }

  buffer += decoder.decode();
  const parsed = parseSseBlock(buffer);
  if (parsed) onEvent(parsed);
}

function parseSseBlock(block: string): ChatStreamEvent | null {
  const lines = block.split('\n').map((line) => line.trimEnd());
  const eventLine = lines.find((line) => line.startsWith('event:'));
  const dataLines = lines.filter((line) => line.startsWith('data:'));
  if (!eventLine || dataLines.length === 0) return null;
  const event = eventLine.replace(/^event:\s*/, '');
  const rawData = dataLines.map((line) => line.replace(/^data:\s*/, '')).join('\n');
  try {
    const data = JSON.parse(rawData) as Record<string, unknown>;
    return { event, data };
  } catch {
    return { event, data: { raw: rawData } };
  }
}
