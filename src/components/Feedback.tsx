import { LuCheck, LuLoaderCircle, LuRotateCcw, LuSparkles, LuSpellCheck, LuSquare, LuVolume2 } from 'react-icons/lu';
import type { ChatMessage, Language } from '../types';
import { formatReset } from '../services/ai';
import type { TurnError } from '../lib/useConversation';

interface FeedbackProps {
  message: ChatMessage;
  lang: Language;
  checking: boolean;
  onCheck: () => void;
  speakingId: string | null;
  onSpeak: (id: string, text: string) => void;
}

/**
 * The tutor's feedback under one of the learner's messages – shared by AI Chat
 * and Live Speaking. Praise comes first, then the improved sentence, then the
 * (level-limited) explanations.
 */
export function Feedback({ message: m, lang, checking, onCheck, speakingId, onSpeak }: FeedbackProps) {
  const c = m.correction;
  const fixId = `${m.id}:fix`;
  const sourceLabel = c?.source === 'ai' ? 'AI tutor' : 'LanguageTool';
  const langProps = { lang: lang.code, dir: lang.rtl ? ('rtl' as const) : ('ltr' as const) };

  if (checking) {
    return (
      <p className="msg__status">
        <LuLoaderCircle className="spin" aria-hidden="true" />
        Checking…
      </p>
    );
  }

  if (!c) {
    return (
      <div className="msg__tools">
        <button type="button" className="tool" onClick={onCheck}>
          <LuSpellCheck aria-hidden="true" />
          Check my {lang.name}
        </button>
      </div>
    );
  }

  if (c.status === 'unavailable') {
    return (
      <div className="msg__status msg__status--muted">
        <span>{c.note ?? 'This message could not be checked.'}</span>
        <button type="button" className="tool" onClick={onCheck}>
          <LuRotateCcw aria-hidden="true" />
          Check again
        </button>
      </div>
    );
  }

  if (c.status === 'ok') {
    return (
      <div className="praise">
        <p className="praise__head">
          <LuCheck aria-hidden="true" />
          {m.via === 'voice' ? 'Correct as recognised' : 'Correct'}
          <small>{sourceLabel}</small>
        </p>
        {c.praise && <p className="praise__text">{c.praise}</p>}
        {c.alternative && (
          <p className="praise__alt">
            You could also say: <span {...langProps}>{c.alternative}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="correction">
      {c.praise && (
        <p className="correction__praise">
          <LuSparkles aria-hidden="true" />
          {c.praise}
        </p>
      )}
      <div className="correction__head">
        <LuSpellCheck aria-hidden="true" />
        <span>A better way to say it</span>
        <small>{sourceLabel}</small>
      </div>
      <p className="correction__text" {...langProps}>
        {c.corrected}
      </p>
      {c.issues.length > 0 && (
        <ul className="correction__issues">
          {c.issues.map((issue, i) => (
            <li key={i}>
              <span className="correction__change" {...langProps}>
                {issue.original && <del>{issue.original}</del>}
                {issue.replacement && <ins>{issue.replacement}</ins>}
              </span>
              {issue.note && <span className="correction__note">{issue.note}</span>}
            </li>
          ))}
        </ul>
      )}
      {c.alternative && (
        <p className="correction__alt">
          More natural: <span {...langProps}>{c.alternative}</span>
        </p>
      )}
      {c.corrected && (
        <button type="button" className={`tool ${speakingId === fixId ? 'is-active' : ''}`} onClick={() => onSpeak(fixId, c.corrected ?? '')}>
          {speakingId === fixId ? <LuSquare aria-hidden="true" /> : <LuVolume2 aria-hidden="true" />}
          {speakingId === fixId ? 'Stop' : 'Hear the correct version'}
        </button>
      )}
    </div>
  );
}

interface TurnErrorProps {
  error: TurnError;
  /** seconds until a retry is sensible (0 = now) */
  wait: number;
  onRetry: () => void;
}

const QUOTA_CODES = ['quota_exhausted', 'site_quota', 'visitor_quota'];

/** Shown in the conversation when the tutor could not answer. Nothing is faked in its place. */
export function TurnErrorNotice({ error, wait, onRetry }: TurnErrorProps) {
  const quota = QUOTA_CODES.includes(error.code);
  return (
    <div className="thread__error" role="alert">
      <div>
        <strong>{quota ? 'The free quota for today is used up.' : error.code === 'free_busy' ? 'The tutor needs a short break.' : 'The tutor could not reply.'}</strong>
        <p>
          {error.message}
          {error.resetAt ? ` That is ${formatReset(error.resetAt)} your time.` : ''}
        </p>
        <p className="thread__error-note">Your message is saved and will be answered when you try again.</p>
        <div className="thread__error-actions">
          <button type="button" className="btn btn--small" onClick={onRetry} disabled={wait > 0}>
            <LuRotateCcw aria-hidden="true" />
            {wait > 0 ? `Try again in ${wait} s` : 'Try again'}
          </button>
          <a className="btn btn--small btn--ghost" href="#/settings">
            About the AI
          </a>
        </div>
      </div>
    </div>
  );
}
