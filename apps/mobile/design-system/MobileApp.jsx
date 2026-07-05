const { NavItem } = window.ApexDesignSystem_659910;

const TABS = [
  { key: 'dashboard', icon: 'target', label: 'Dashboard' },
  { key: 'progress', icon: 'layers', label: 'Progress' },
  { key: 'chat', icon: 'zap', label: 'AI Chat' },
  { key: 'profile', icon: 'user', label: 'Profile' },
];

function MobileApp() {
  const [tab, setTab] = React.useState('dashboard');
  return (
    <window.IOSDevice title="">
      <div style={{ background: 'var(--bg-app)', minHeight: '100%', display: 'flex', flexDirection: 'column', position: 'relative', fontFamily: 'var(--font-body)' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'dashboard' && <window.DashboardScreen />}
          {tab === 'progress' && <window.ProgressScreen />}
          {tab === 'chat' && <window.ChatScreen />}
          {tab === 'profile' && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', font: 'var(--text-body-m)' }}>
              Profile screen not shown in reference designs.
            </div>
          )}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            left: 16,
            right: 16,
            display: 'flex',
            justifyContent: 'space-between',
            background: 'var(--bg-surface-dark)',
            borderRadius: 'var(--radius-pill)',
            padding: 8,
            boxShadow: 'var(--shadow-dark-surface)',
          }}
        >
          {TABS.map((t) => (
            <NavItem
              key={t.key}
              icon={t.icon}
              label={t.key === tab ? t.label : ''}
              active={t.key === tab}
              orientation="horizontal"
              onClick={() => setTab(t.key)}
            />
          ))}
        </div>
      </div>
    </window.IOSDevice>
  );
}

window.MobileApp = MobileApp;
