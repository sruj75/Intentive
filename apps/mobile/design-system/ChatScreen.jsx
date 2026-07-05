const DS3 = window.ApexDesignSystem_659910;
const { ChatBubble, ChatInput, IconButton: IconButton3, Button: Button3, RingProgress: RingProgressC } = DS3;

function ChatScreen() {
  const [messages, setMessages] = React.useState([
    { from: 'user', text: 'How many calories did I burn yesterday?', ts: '2 hours ago' },
    { from: 'bot', text: 'You burned 420 kcal across 3 activities' },
    { from: 'user', text: 'Remind me to stretch at 8 PM', ts: '1 hours ago' },
  ]);
  const [draft, setDraft] = React.useState('');

  function send() {
    if (!draft.trim()) return;
    setMessages((m) => [...m, { from: 'user', text: draft }]);
    setDraft('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 20px 20px', boxSizing: 'border-box' }}>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 12 }}>
        {messages.map((m, i) => (
          <ChatBubble key={i} from={m.from} timestamp={m.ts}>{m.text}</ChatBubble>
        ))}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface)', padding: '12px 16px', borderRadius: 16, boxShadow: 'var(--shadow-card)' }}>
            <div>
              <div style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)' }}>Running</div>
              <b style={{ font: 'var(--text-body-m)' }}>120kcal</b>
            </div>
            <RingProgressC rings={[{ value: 60, max: 100, color: 'var(--accent)' }]} size={34} thickness={5} arcDegrees={300} />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface)', padding: '12px 16px', borderRadius: 16, boxShadow: 'var(--shadow-card)' }}>
            <div>
              <div style={{ font: 'var(--text-body-s)', color: 'var(--text-secondary)' }}>Push up</div>
              <b style={{ font: 'var(--text-body-m)' }}>200kcal</b>
            </div>
            <RingProgressC rings={[{ value: 38, max: 100, color: 'var(--accent)' }]} size={34} thickness={5} arcDegrees={300} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
          <IconButton3 icon="zap" variant="accent" size="l" label="Energy" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto' }}>
        <Button3 variant="outline" size="s">Start workout</Button3>
        <Button3 variant="outline" size="s">Log water</Button3>
        <Button3 variant="outline" size="s">How did I sleep?</Button3>
      </div>
      <ChatInput value={draft} onChange={setDraft} onSubmit={send} />
    </div>
  );
}

window.ChatScreen = ChatScreen;
