function DesktopApp() {
  const [active, setActive] = React.useState('dashboard');
  return (
    <div style={{ display: 'flex', gap: 20, maxWidth: 1400, margin: '0 auto', alignItems: 'stretch' }}>
      <window.Sidebar active={active} onSelect={setActive} />
      <div style={{
        flex: 1, display: 'flex', gap: 32, minWidth: 0,
        background: 'linear-gradient(180deg, #F6F5F2 0%, #EFEEE9 100%)',
        borderRadius: 'var(--radius-xl)', padding: '40px 40px 44px',
        boxShadow: 'var(--shadow-raised)', boxSizing: 'border-box',
      }}>
        <window.MainPanel />
        <window.ChatPanel />
      </div>
    </div>
  );
}

window.DesktopApp = DesktopApp;
