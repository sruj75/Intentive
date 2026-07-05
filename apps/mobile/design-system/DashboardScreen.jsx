const DS = window.ApexDesignSystem_659910;
const { IconButton, Card, StatCard, ProgressBar } = DS;

function DashboardScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 20px 100px' }}>
      <h1 style={{ font: 'var(--text-display-xl)', color: 'var(--text-primary)', margin: '12px 0 0', letterSpacing: 'var(--tracking-tight)' }}>
        Let&rsquo;s start strong!
      </h1>

      <Card variant="muted" padding="20px 22px">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <span style={{ font: 'var(--text-title)', color: 'var(--text-primary)', maxWidth: 190 }}>You&rsquo;re 45% to your daily goal</span>
          <IconButton icon="zap" variant="accent" size="m" label="Energy" />
        </div>
        <ProgressBar value={2340} max={8000} valueLabel="2,340/8000" />
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {[['dumbbell', 'Workout'], ['coffee', 'Meal'], ['droplet', 'Water'], ['watch', 'Sync']].map(([icon, label]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <IconButton icon={icon} label={label} />
            <span style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>

      <div>
        <h2 style={{ font: 'var(--text-display-m)', color: 'var(--text-primary)', margin: '0 0 14px' }}>Daily Summary</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <StatCard label="Steps" value="2.340" style={{ flex: 1 }} />
          <StatCard label="Calories Burned" value="320" unit="kcal" style={{ flex: 1 }} />
        </div>
      </div>
    </div>
  );
}

window.DashboardScreen = DashboardScreen;
