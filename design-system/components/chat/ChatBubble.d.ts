export interface ChatBubbleProps {
  from?: 'user' | 'bot';
  /** light = default mobile chat screen (gray user bubble on white); dark = desktop AI panel (translucent-white user bubble on charcoal) */
  surface?: 'light' | 'dark';
  children: React.ReactNode;
  timestamp?: string;
}
