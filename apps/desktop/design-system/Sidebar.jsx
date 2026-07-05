const DSd = window.ApexDesignSystem_659910;
const { Icon: SIcon, Button: SButton } = DSd;

const SIDEBAR_ITEMS = [
  { key: 'dashboard', icon: 'target', label: 'Dashboard' },
  { key: 'progress', icon: 'layers', label: 'Progress' },
  { key: 'insights', icon: 'zap', label: 'Insights' },
  { key: 'mood', icon: 'heart', label: 'Mood' },
  { key: 'stats', icon: 'gauge', label: 'Stats' },
  { key: 'profile', icon: 'user', label: 'Profile' },
  { key: 'settings', icon: 'settings', label: 'Settings' },
];

function Sidebar({ active, onSelect }) {
  return (
    <div style={{
      width: 232,
      background: 'linear-gradient(180deg, #333330 0%, #232320 100%)',
      borderRadius: 'var(--radius-xl)',
      padding: '30px 16px 22px',
      display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0,
      boxShadow: 'var(--shadow-dark-surface)',
    }}>
      {SIDEBAR_ITEMS.map((item) => {
        const on = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '11px 12px', borderRadius: 'var(--radius-pill)',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              background: on ? 'rgba(255,255,255,0.10)' : 'transparent',
              color: on ? 'var(--text-on-dark)' : 'rgba(255,255,255,0.5)',
              transition: 'background 0.15s ease',
            }}
          >
            <span style={{
              width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: on ? 'var(--apex-white)' : 'rgba(255,255,255,0.07)',
              color: on ? 'var(--accent)' : 'rgba(255,255,255,0.65)',
              boxShadow: on ? '0 4px 12px rgba(0,0,0,0.25)' : 'none',
            }}>
              <SIcon name={item.icon} size={18} strokeWidth={2.2} />
            </span>
            <span style={{ font: 'var(--text-body-m)', fontWeight: on ? 700 : 500 }}>{item.label}</span>
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 22, padding: '20px 18px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', bottom: -30, right: -20, width: 90, height: 90, background: 'var(--glow-accent-radial)', filter: 'blur(6px)' }} />
        <p style={{ font: 'var(--text-body-m)', fontWeight: 700, color: 'var(--text-on-dark)', margin: '0 0 6px', position: 'relative' }}>Sync your wearable</p>
        <p style={{ font: 'var(--text-body-s)', color: 'rgba(255,255,255,0.55)', margin: '0 0 16px', position: 'relative' }}>Connect a device to unlock deeper insights.</p>
        <SButton variant="secondary" size="s" style={{ background: 'var(--apex-white)', color: 'var(--apex-black)', position: 'relative' }}>Get Started</SButton>
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
