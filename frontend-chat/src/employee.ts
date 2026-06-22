import type { AgentProfileRead } from './types';
import type { AuthUser } from './api/client';

export type EmployeeProfile = {
  roleName: string;
  avatarText: string;
  avatarTone: string;
  avatarKind: 'preset' | 'upload';
  avatarPreset: string;
  avatarImage: string;
};

const AVATAR_PRESETS: Record<string, { text: string; tone: string }> = {
  'service-orbit': { text: '客', tone: 'teal' },
  'after-sales-seal': { text: '售', tone: 'copper' },
  'knowledge-node': { text: '知', tone: 'olive' },
  'commerce-compass': { text: '导', tone: 'blue' },
  'ops-grid': { text: '运', tone: 'ink' },
  'quality-star': { text: '质', tone: 'gold' },
};

function stringFromMeta(metadata: Record<string, unknown> | undefined, key: string): string {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : '';
}

export function employeeProfile(agent?: AgentProfileRead | null): EmployeeProfile {
  if (agent?.is_overall) {
    return {
      roleName: '开放广场平台',
      avatarText: '广',
      avatarTone: 'overall',
      avatarKind: 'preset',
      avatarPreset: 'overall',
      avatarImage: '',
    };
  }
  const presetKey = stringFromMeta(agent?.metadata, 'avatar_preset') || 'service-orbit';
  const preset = AVATAR_PRESETS[presetKey] || AVATAR_PRESETS['service-orbit'];
  const avatarImage = stringFromMeta(agent?.metadata, 'avatar_image');
  const avatarKind = stringFromMeta(agent?.metadata, 'avatar_kind') === 'upload' && avatarImage ? 'upload' : 'preset';
  return {
    roleName: stringFromMeta(agent?.metadata, 'role_name') || '在线客服员工',
    avatarText: stringFromMeta(agent?.metadata, 'avatar_text') || preset.text || '员',
    avatarTone: stringFromMeta(agent?.metadata, 'avatar_tone') || preset.tone || 'teal',
    avatarKind,
    avatarPreset: presetKey,
    avatarImage,
  };
}

export function employeeDisplayName(agent?: AgentProfileRead | null): string {
  if (!agent) return '数字员工';
  if (agent.is_overall) return '开放广场平台';
  return (agent.name || '数字员工').replace(/智能体/g, '员工');
}

export function isGalleryEmployee(agent?: AgentProfileRead | null): boolean {
  return agent?.metadata?.published_to_gallery === true;
}

export function isEmployeeOwnedBy(agent: AgentProfileRead, user?: AuthUser | null): boolean {
  if (!user) return false;
  const ownerUserId = agent.metadata?.owner_user_id;
  const ownerUsername = agent.metadata?.owner_username;
  return ownerUserId === user.id || ownerUsername === user.username;
}

export function visibleChatEmployees(rows: AgentProfileRead[], user?: AuthUser | null): AgentProfileRead[] {
  return rows.filter((agent) => !agent.is_overall && agent.status === 'active');
}
