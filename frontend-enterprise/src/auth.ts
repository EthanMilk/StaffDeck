export type EnterpriseAuthUser = {
  id: string;
  tenant_id: string;
  username: string;
  display_name?: string;
  role: 'admin' | 'member';
};

export type EnterpriseAuthSession = {
  token: string;
  user: EnterpriseAuthUser;
};

export const ENTERPRISE_AUTH_STORAGE_KEY = 'ultrarag_auth';
const LEGACY_ENTERPRISE_AUTH_STORAGE_KEY = 'ultrarag_enterprise_auth';
const LEGACY_CHAT_AUTH_STORAGE_KEY = 'skill_agent_auth';

export function getEnterpriseAuthSession(): EnterpriseAuthSession | null {
  const current = readStoredSession(ENTERPRISE_AUTH_STORAGE_KEY);
  if (current) return current;

  const legacyEnterprise = readStoredSession(LEGACY_ENTERPRISE_AUTH_STORAGE_KEY);
  const legacyChat = readStoredSession(LEGACY_CHAT_AUTH_STORAGE_KEY);
  const migrated = legacyEnterprise || legacyChat;
  if (migrated) {
    setEnterpriseAuthSession(migrated);
    return migrated;
  }
  return null;
}

export function setEnterpriseAuthSession(session: EnterpriseAuthSession): void {
  window.localStorage.setItem(ENTERPRISE_AUTH_STORAGE_KEY, JSON.stringify(session));
  window.localStorage.removeItem(LEGACY_ENTERPRISE_AUTH_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_CHAT_AUTH_STORAGE_KEY);
}

export function clearEnterpriseAuthSession(): void {
  window.localStorage.removeItem(ENTERPRISE_AUTH_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_ENTERPRISE_AUTH_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_CHAT_AUTH_STORAGE_KEY);
}

function readStoredSession(key: string): EnterpriseAuthSession | null {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EnterpriseAuthSession;
    if (!parsed.token || !parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isEnterpriseAdmin(user?: EnterpriseAuthUser | null): boolean {
  return user?.role === 'admin';
}

export function isGalleryEmployee(agent?: { metadata?: Record<string, unknown> } | null): boolean {
  return agent?.metadata?.published_to_gallery === true;
}

export function isEmployeeOwnedBy(
  agent: { metadata?: Record<string, unknown> },
  user?: EnterpriseAuthUser | null,
): boolean {
  if (!user) return false;
  const metadata = agent.metadata || {};
  const ownerUserId = metadata.owner_user_id;
  return ownerUserId === user.id;
}
