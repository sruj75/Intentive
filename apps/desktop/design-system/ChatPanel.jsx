const DSc = window.ApexDesignSystem_659910;
const { ChatBubble: CChatBubble, ChatInput: CChatInput, Icon: CIcon, RingProgress: CRing } = DSc;

function MiniActivity({ label, kcal, pct }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 18, padding: '14px 16px', boxShadow: 'var(--shadow-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)' }}>{label}</div>
        <div style={{ font: 'var(--text-body-m)', fontWeight: 700, color: 'var(--text-primary)' }}>{kcal}</div>
      </div>
      <CRing rings={[{ value: pct, max: 100, color: 'var(--accent)' }]} size={38} thickness={5} arcDegrees={300} />
    </div>
  );
}

function ChatPanel() {
  const [messages, setMessages] = React.useState([
    { from: 'user', text: 'How many calories did I burn yesterday?', ts: '2 hours ago' },
    { from: 'bot', text: 'You burned 420 kcal across 3 activities' },
  ]);
  const [draft, setDraft] = React.useState('');

  function send() {
    if (!draft.trim()) return;
    setMessages((m) => [...m, { from: 'user', text: draft }]);
    setDraft('');
  }

  return (
    <div style={{ width: 360, flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 8 }}>
      {/* soft orange bloom behind the pill */}
      <div style={{ position: 'absolute', top: -30, left: '30%', right: -10, height: 200, background: 'var(--glow-accent-radial)', filter: 'blur(12px)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent)', color: 'var(--text-on-dark)', borderRadius: 'var(--radius-pill)', padding: '10px 20px', font: 'var(--text-label)', boxShadow: 'var(--shadow-accent-glow)' }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--apex-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
            <CIcon name="sparkles" size={12} filled />
          </span>
          AI Chatbot
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', position: 'relative', zIndex: 1 }}>
        {messages.map((m, i) => (
          <CChatBubble key={i} from={m.from} surface="light" timestamp={m.ts}>{m.text}</CChatBubble>
        ))}
        <div style={{ display: 'flex', gap: 12 }}>
          <MiniActivity label="Running" kcal="120kcal" pct={60} />
          <MiniActivity label="Push up" kcal="200kcal" pct={38} />
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <CChatInput value={draft} onChange={setDraft} onSubmit={send} />
      </div>
    </div>
  );
}

window.ChatPanel = ChatPanel;
