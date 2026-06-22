import type { EmployeeProfile } from '../employee';

const AVATAR_STYLES: Record<string, {
  bg: string;
  bgSoft: string;
  hair: string;
  shirt: string;
  accent: string;
  skin: string;
}> = {
  'service-orbit': { bg: '#bdeee4', bgSoft: '#e8fbf6', hair: '#15110f', shirt: '#111827', accent: '#0f766e', skin: '#f3c8aa' },
  'after-sales-seal': { bg: '#ffd9bd', bgSoft: '#fff3ea', hair: '#2c1c13', shirt: '#7c3f22', accent: '#a85d32', skin: '#f1c09d' },
  'knowledge-node': { bg: '#dce8b7', bgSoft: '#f5fae8', hair: '#1f2517', shirt: '#26311d', accent: '#65743a', skin: '#f2c6a7' },
  'commerce-compass': { bg: '#cfe0ff', bgSoft: '#eef5ff', hair: '#16171a', shirt: '#1f3f84', accent: '#3562b8', skin: '#efc4a5' },
  'ops-grid': { bg: '#d8e1e8', bgSoft: '#f4f7f9', hair: '#111820', shirt: '#202a33', accent: '#29323a', skin: '#f0c6a8' },
  'quality-star': { bg: '#ffe6a5', bgSoft: '#fff7dd', hair: '#18130d', shirt: '#725014', accent: '#b78423', skin: '#f4c9a8' },
  overall: { bg: '#cbece5', bgSoft: '#f0fbf8', hair: '#17201d', shirt: '#263238', accent: '#0f766e', skin: '#f2c7aa' },
};

export default function EmployeeAvatarMark({
  profile,
  fallback = '员',
  className = 'new-session-agent-logo',
}: {
  profile?: EmployeeProfile | null;
  fallback?: string;
  className?: string;
}) {
  const classes = [
    className,
    `tone-${profile?.avatarTone || 'teal'}`,
    `avatar-preset-${profile?.avatarPreset || 'service-orbit'}`,
    profile?.avatarKind === 'upload' && profile.avatarImage ? 'is-uploaded-avatar' : '',
  ].filter(Boolean).join(' ');

  if (profile?.avatarKind === 'upload' && profile.avatarImage) {
    return (
      <span className={classes}>
        <img src={profile.avatarImage} alt="" />
      </span>
    );
  }

  return (
    <span className={classes} aria-label={`${profile?.avatarText || fallback}员工头像`}>
      <PresetPersonAvatar preset={profile?.avatarPreset || 'service-orbit'} />
    </span>
  );
}

function PresetPersonAvatar({ preset }: { preset: string }) {
  const style = AVATAR_STYLES[preset] || AVATAR_STYLES['service-orbit'];
  const hasGlasses = preset === 'ops-grid' || preset === 'quality-star';
  return (
    <svg className="employee-avatar-portrait" viewBox="0 0 96 96" aria-hidden="true" focusable="false">
      <circle cx="48" cy="48" r="47" fill={style.bgSoft} />
      <circle cx="48" cy="49" r="39" fill={style.bg} />
      <circle cx="64" cy="28" r="11" fill="#fff" opacity="0.34" />
      <path d="M19 89c4-21 15-32 29-32s25 11 29 32H19Z" fill={style.shirt} />
      <path d="M34 61c4 6 8 9 14 9s10-3 14-9l4 28H30l4-28Z" fill="#fff" opacity="0.92" />
      <path d="M42 56h12v15H42z" fill={style.skin} />
      {preset === 'commerce-compass' && <path d="M28 34c1-17 12-27 27-24 16 3 22 17 18 35-2 9-6 17-9 23-2-10-4-22-4-34H28Z" fill={style.hair} />}
      {preset === 'knowledge-node' && <path d="M27 36c0-16 9-27 22-27 15 0 24 10 24 27 0 13-5 25-11 32-1-11-2-22-2-34H27Z" fill={style.hair} />}
      {preset === 'quality-star' && (
        <g fill={style.hair}>
          {[29, 36, 44, 52, 60, 67].map((cx, index) => (
            <circle key={cx} cx={cx} cy={24 + (index % 2) * 4} r="8" />
          ))}
          <circle cx="25" cy="36" r="8" />
          <circle cx="70" cy="37" r="8" />
        </g>
      )}
      <ellipse cx="48" cy="38" rx="15" ry="20" fill={style.skin} />
      {renderHair(preset, style.hair)}
      <circle cx="42" cy="39" r="1.9" fill="#211b17" />
      <circle cx="54" cy="39" r="1.9" fill="#211b17" />
      {hasGlasses && (
        <g fill="none" stroke="#211b17" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="42" cy="39" r="5" />
          <circle cx="54" cy="39" r="5" />
          <path d="M47 39h2" />
        </g>
      )}
      <path d="M48 41l-2 6h4" fill="none" stroke="#8d604a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 50c4 4 9 4 13 0" fill="none" stroke="#241b16" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M29 88c2-16 8-25 17-28" fill="none" stroke={style.accent} strokeWidth="3" strokeLinecap="round" opacity="0.72" />
      <path d="M67 88c-2-16-8-25-17-28" fill="none" stroke={style.accent} strokeWidth="3" strokeLinecap="round" opacity="0.72" />
    </svg>
  );
}

function renderHair(preset: string, hair: string) {
  if (preset === 'after-sales-seal') {
    return <path d="M33 31c3-14 21-20 31-8 1 4 0 8-2 12-7-7-18-9-29-4Z" fill={hair} />;
  }
  if (preset === 'knowledge-node') {
    return <path d="M31 31c2-13 15-21 28-15 7 3 10 10 9 20-9-7-23-10-37-5Z" fill={hair} />;
  }
  if (preset === 'commerce-compass') {
    return <path d="M32 31c2-13 17-20 29-12 5 4 7 10 6 17-8-6-22-9-35-5Z" fill={hair} />;
  }
  if (preset === 'ops-grid') {
    return <path d="M34 29c4-12 22-16 30-5 1 3 1 6 0 9-8-5-19-7-30-4Z" fill={hair} />;
  }
  if (preset === 'quality-star') {
    return <path d="M33 30c5-11 22-14 31-4 1 3 1 6 0 9-8-5-21-7-31-5Z" fill={hair} />;
  }
  return (
    <g fill={hair}>
      <path d="M31 32c2-15 17-23 30-16 7 4 10 12 8 20-10-8-24-10-38-4Z" />
      <circle cx="65" cy="34" r="6" />
    </g>
  );
}
