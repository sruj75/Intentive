const DS2 = window.ApexDesignSystem_659910;
const { SegmentedControl, Card: Card2, RingProgress, IconButton: IconButton2, Button } = DS2;

function ProgressScreen() {
  const [range, setRange] = React.useState('Weekly');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 20px 100px' }}>
      <div style={{ margin: '8px 0 4px' }}>
        <SegmentedControl options={['Daily', 'Weekly', 'Monthly']} value={range} onChange={setRange} />
      </div>

      <Card2 variant="accent" padding="24px 22px" style={{ position: 'relative', overflow: 'hidden' }}>
        <IconButton2 icon="watch" label="Streak" variant="dark" size="s" style={{ marginBottom: 14 }} />
        <p style={{ font: 'var(--text-title)', margin: '0 0 18px', maxWidth: 220 }}>Stretching after workouts improves your sleep quality.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" size="s">Dismiss</Button>
          <Button variant="secondary" size="s" style={{ background: 'var(--apex-white)', color: 'var(--text-primary)' }}>Set Routine</Button>
        </div>
      </Card2>

      <Card2 variant="surface" padding="22px 22px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <RingProgress rings={[{ value: 240, max: 600, color: 'var(--accent)' }, { value: 160, max: 600, color: 'var(--apex-black)' }]} size={96} thickness={10} arcDegrees={270} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                <span style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)' }}>Exercise</span>
              </div>
              <span style={{ font: 'var(--text-stat-m)' }}>240<span style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)' }}>/600min</span></span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--apex-black)' }} />
                <span style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)' }}>Stand</span>
              </div>
              <span style={{ font: 'var(--text-stat-m)' }}>160<span style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)' }}>/600min</span></span>
            </div>
          </div>
        </div>
      </Card2>

      <div style={{ display: 'flex', gap: 12 }}>
        <Card2 variant="muted" padding="18px 20px" style={{ flex: 1 }}>
          <div style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)', marginBottom: 12 }}>Steps</div>
          <div style={{ font: 'var(--text-stat-l)', marginBottom: 14 }}>2.340</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 40 }}>
            {[10,16,12,20,14,28,40,30,20,14,10,16].map((h,i) => <span key={i} style={{ flex: 1, height: h, borderRadius: 'var(--radius-pill)', background: (i===5||i===6) ? 'var(--apex-black)' : 'var(--apex-gray-300)' }} />)}
          </div>
        </Card2>
        <Card2 variant="dark" padding="18px 20px" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <svg width="86" height="46" viewBox="0 0 120 66" fill="none"><path d="M18 40 C 6 30, 14 12, 34 14 C 54 16, 44 40, 64 42 C 88 44, 78 14, 100 18 C 116 21, 110 44, 92 46" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="18" cy="40" r="4" fill="var(--accent)"/></svg>
          </div>
          <div>
            <div style={{ font: 'var(--text-body-s)', color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Distance</div>
            <div style={{ font: 'var(--text-stat-l)', color: 'var(--text-on-dark)' }}>3.4km</div>
          </div>
        </Card2>
      </div>
    </div>
  );
}

window.ProgressScreen = ProgressScreen;
