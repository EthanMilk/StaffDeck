import type { AgentProfileRead, AgentResourceType } from './types';
import type { AuthUser } from './api/client';

export type EmployeeProfile = {
  roleKey: string;
  roleName: string;
  avatarText: string;
  avatarTone: string;
  avatarKind: 'preset' | 'upload';
  avatarPreset: string;
  avatarImage: string;
  workStyles: string[];
  expertiseTags: string[];
  workModes: string[];
};

const AVATAR_PRESETS: Record<string, { text: string; tone: string }> = {
  'service-orbit': { text: '客', tone: 'teal' },
  'after-sales-seal': { text: '售', tone: 'copper' },
  'knowledge-node': { text: '知', tone: 'olive' },
  'commerce-compass': { text: '导', tone: 'blue' },
  'ops-grid': { text: '运', tone: 'ink' },
  'quality-star': { text: '质', tone: 'gold' },
};

const EMPLOYEE_TEMPLATES: Record<string, {
  roleName: string;
  avatarText: string;
  avatarTone: string;
  avatarPreset: string;
  workStyles: string[];
  expertiseTags: string[];
  workModes: string[];
}> = {
  'service-specialist': {
    roleName: '在线客服',
    avatarText: '客',
    avatarTone: 'teal',
    avatarPreset: 'service-orbit',
    workStyles: ['事实先行', '流程推进', '及时追问'],
    expertiseTags: ['用户接待', '购买引导', '售后分诊'],
    workModes: ['先确认诉求', '调用 SOP', '必要时补齐信息'],
  },
  'after-sales': {
    roleName: '售后处理',
    avatarText: '售',
    avatarTone: 'copper',
    avatarPreset: 'after-sales-seal',
    workStyles: ['证据优先', '风险克制', '留痕复盘'],
    expertiseTags: ['退款', '换货', '权益核对'],
    workModes: ['查订单', '核规则', '给结论'],
  },
  'knowledge-operator': {
    roleName: '知识运营',
    avatarText: '知',
    avatarTone: 'olive',
    avatarPreset: 'knowledge-node',
    workStyles: ['结构化整理', '可追溯', '持续学习'],
    expertiseTags: ['资料维护', '引用来源', 'SOP'],
    workModes: ['解析文档', '组织结构', '发现缺口'],
  },
  'commerce-guide': {
    roleName: '商品导购',
    avatarText: '导',
    avatarTone: 'blue',
    avatarPreset: 'commerce-compass',
    workStyles: ['偏好敏感', '主动比较', '确认后执行'],
    expertiseTags: ['商品比价', '购买流程', '偏好记忆'],
    workModes: ['理解需求', '比较选项', '确认下单'],
  },
};

const DEFAULT_WORK_STYLES = ['目标明确', '证据优先', '动作可追溯'];
const DEFAULT_EXPERTISE = ['业务问答', 'SOP 执行', '工具调用'];
const DEFAULT_WORK_MODES = ['识别意图', '补齐信息', '执行并复盘'];

function stringFromMeta(metadata: Record<string, unknown> | undefined, key: string): string {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function arrayFromMeta(metadata: Record<string, unknown> | undefined, key: string): string[] {
  const value = metadata?.[key];
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function employeeProfile(agent?: AgentProfileRead | null): EmployeeProfile {
  if (agent?.is_overall) {
    return {
      roleKey: 'overall',
      roleName: '开放广场',
      avatarText: '广',
      avatarTone: 'overall',
      avatarKind: 'preset',
      avatarPreset: 'overall',
      avatarImage: '',
      workStyles: [],
      expertiseTags: [],
      workModes: [],
    };
  }
  const metadata = agent?.metadata || {};
  const isBlankOnboarding = metadata.blank_onboarding === true;
  const roleKey = stringFromMeta(metadata, 'role_key');
  const templateKey = isBlankOnboarding ? '' : roleKey || 'service-specialist';
  const template = templateKey ? EMPLOYEE_TEMPLATES[templateKey] || EMPLOYEE_TEMPLATES['service-specialist'] : undefined;
  const presetKey = stringFromMeta(metadata, 'avatar_preset') || template?.avatarPreset || 'service-orbit';
  const preset = AVATAR_PRESETS[presetKey] || AVATAR_PRESETS['service-orbit'];
  const avatarImage = stringFromMeta(metadata, 'avatar_image');
  const avatarKind = stringFromMeta(metadata, 'avatar_kind') === 'upload' && avatarImage ? 'upload' : 'preset';
  const workStyles = arrayFromMeta(metadata, 'work_styles');
  const expertiseTags = arrayFromMeta(metadata, 'expertise_tags');
  const workModes = arrayFromMeta(metadata, 'work_modes');
  return {
    roleKey: roleKey || (template ? templateKey : ''),
    roleName: stringFromMeta(metadata, 'role_name') || template?.roleName || '待补充岗位',
    avatarText: stringFromMeta(metadata, 'avatar_text') || preset.text || template?.avatarText || '员',
    avatarTone: stringFromMeta(metadata, 'avatar_tone') || preset.tone || template?.avatarTone || 'teal',
    avatarKind,
    avatarPreset: presetKey,
    avatarImage,
    workStyles: workStyles.length ? workStyles : isBlankOnboarding ? [] : DEFAULT_WORK_STYLES,
    expertiseTags: expertiseTags.length ? expertiseTags : isBlankOnboarding ? [] : DEFAULT_EXPERTISE,
    workModes: workModes.length ? workModes : isBlankOnboarding ? [] : DEFAULT_WORK_MODES,
  };
}

export function employeeDisplayName(agent?: AgentProfileRead | null): string {
  if (!agent) return '数字员工';
  if (agent.is_overall) return '开放广场';
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

export function agentResourceCount(agent: AgentProfileRead, resourceType: AgentResourceType): number {
  return (agent.resources || []).filter((resource) => (
    resource.resource_type === resourceType
    && resource.status !== 'deleted'
    && resource.status !== 'inactive'
  )).length;
}
