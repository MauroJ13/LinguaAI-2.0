import { LuMessagesSquare, LuMic } from 'react-icons/lu';

/** Switches between typing and speaking – the same conversation, language and level either way. */
export function ModeSwitch({ mode, conversationId }: { mode: 'chat' | 'speak'; conversationId?: string }) {
  const suffix = conversationId ? `/${conversationId}` : '';
  return (
    <nav className="modeswitch" aria-label="Practice mode">
      <a href={`#/chat${suffix}`} className={mode === 'chat' ? 'is-active' : ''} aria-current={mode === 'chat' ? 'page' : undefined}>
        <LuMessagesSquare aria-hidden="true" />
        <span>Chat</span>
      </a>
      <a href={`#/speak${suffix}`} className={mode === 'speak' ? 'is-active' : ''} aria-current={mode === 'speak' ? 'page' : undefined}>
        <LuMic aria-hidden="true" />
        <span>Live Speaking</span>
      </a>
    </nav>
  );
}
