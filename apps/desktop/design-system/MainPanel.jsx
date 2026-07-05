const DSm = window.ApexDesignSystem_659910;
const { IconButton: MIconButton, Card: MCard, ProgressBar: MProgressBar, SegmentedControl: MSegmentedControl, RingProgress: MRingProgress } = DSm;

const STEP_BARS = [10,16,12,20,14,26,18,44,54,40,30,22,16,12];

function RouteLine() {
  return (
    <svg width="120" height="66" viewBox="0 0 120 66" fill="none" style={{ display: 'block' }}>
      <path d="M18 40 C 6 30, 14 12, 34 14 C 54 16, 44 40, 64 42 C 88 44, 78 14, 100 18 C 116 21, 110 44, 92 46"
        stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="40" r="4" fill="var(--accent)" />
    </svg>
  );
}

function MainPanel() {
  const [range, setRange] = React.useState('Weekly');
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>
      <h1 style={{ font: 'var(--text-display-xl)', color: 'var(--text-primary)', margin: 0, letterSpacing: 'var(--tracking-tight)' }}>
        Let&rsquo;s start strong!
      </h1>

      <MCard variant="muted" radius="var(--radius-l)" padding="26px 30px">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <span style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>You&rsquo;re 45% to your daily goal</span>
          <MIconButton icon="zap" variant="accent" size="m" label="Energy" filled />
        </div>
        <MProgressBar value={2340} max={8000} valueLabel="2,340/8000" />
      </MCard>

      <div style={{ display: 'flex', gap: 18 }}>
        {[['dumbbell', 'Workout'], ['coffee', 'Meal'], ['droplet', 'Water'], ['watch', 'Sync'], ['heart', 'Mood']].map(([icon, label]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flex: 1 }}>
            <MIconButton icon={icon} label={label} size="l" />
            <span style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ font: 'var(--text-display-m)', color: 'var(--text-primary)', margin: 0 }}>Summary</h2>
          <MSegmentedControl options={['Daily', 'Weekly', 'Monthly']} value={range} onChange={setRange} />
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          <MCard variant="surface" radius="var(--radius-l)" padding="24px 26px" style={{ flex: 1.4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
              <MRingProgress rings={[{ value: 240, max: 600, color: 'var(--accent)' }, { value: 160, max: 600, color: 'var(--apex-black)' }]} size={104} thickness={11} arcDegrees={270} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                    <span style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)' }}>Exercise</span>
                  </div>
                  <div style={{ font: 'var(--text-stat-m)', color: 'var(--text-primary)' }}>240<span style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)' }}>/600min</span></div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--apex-black)' }} />
                    <span style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)' }}>Stand</span>
                  </div>
                  <div style={{ font: 'var(--text-stat-m)', color: 'var(--text-primary)' }}>160<span style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)' }}>/600min</span></div>
                </div>
              </div>
            </div>
          </MCard>

          <MCard variant="surface" radius="var(--radius-l)" padding="22px 24px" style={{ flex: 1.2 }}>
            <div style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)', marginBottom: 6 }}>Steps</div>
            <div style={{ font: 'var(--text-stat-l)', marginBottom: 18 }}>2.340</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 56 }}>
              {STEP_BARS.map((h, i) => (
                <span key={i} style={{ flex: 1, height: h, borderRadius: 'var(--radius-pill)', background: (i === 7 || i === 8 || i === 9) ? 'var(--apex-black)' : 'var(--apex-gray-300)' }} />
              ))}
            </div>
          </MCard>

          <MCard variant="dark" radius="var(--radius-l)" padding="22px 24px" style={{ flex: 0.9, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><RouteLine /></div>
            <div>
              <div style={{ font: 'var(--text-body-s)', color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Distance</div>
              <div style={{ font: 'var(--text-stat-l)', color: 'var(--text-on-dark)' }}>3.4km</div>
            </div>
          </MCard>
        </div>
      </div>
    </div>
  );
}

window.MainPanel = MainPanel;
