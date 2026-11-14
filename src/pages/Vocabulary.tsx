import { useMemo, useState } from 'react';
import { LuBookOpen, LuLanguages, LuLoaderCircle, LuPencil, LuPlus, LuSearch, LuSquare, LuTrash2, LuVolume2 } from 'react-icons/lu';
import type { VocabItem } from '../types';
import { getLanguage } from '../data/languages';
import { translateText } from '../services/tutor';
import { isDue, vocabStatus, type VocabStatus } from '../lib/util';
import { useSpeech, useToast } from '../lib/hooks';
import { useStore } from '../state/store';
import { useTutor } from '../state/tutor';
import { ConfirmDialog, EmptyState, Flag, LanguageSelect, Modal } from '../components/ui';

const STATUS_LABEL: Record<VocabStatus, string> = { new: 'New', learning: 'Learning', mastered: 'Mastered' };
type Filter = 'all' | VocabStatus;

function dueLabel(item: VocabItem): string {
  if (isDue(item)) return 'Due now';
  const days = Math.ceil((item.srs.due - Date.now()) / 86_400_000);
  return days <= 1 ? 'Due tomorrow' : `Due in ${days} days`;
}

export function Vocabulary() {
  const { data, target, deleteVocab } = useStore();
  const speech = useSpeech();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [allLanguages, setAllLanguages] = useState(false);
  const [editing, setEditing] = useState<VocabItem | 'new' | null>(null);
  const [deleting, setDeleting] = useState<VocabItem | null>(null);

  const scoped = useMemo(() => (allLanguages ? data.vocab : data.vocab.filter((v) => v.lang === target.code)), [allLanguages, data.vocab, target.code]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((v) => {
      if (filter !== 'all' && vocabStatus(v) !== filter) return false;
      if (!q) return true;
      return v.term.toLowerCase().includes(q) || v.translation.toLowerCase().includes(q);
    });
  }, [scoped, query, filter]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: scoped.length, new: 0, learning: 0, mastered: 0 };
    scoped.forEach((v) => {
      c[vocabStatus(v)] += 1;
    });
    return c;
  }, [scoped]);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Vocabulary</h1>
          <p className="lede">
            {scoped.length} {scoped.length === 1 ? 'word' : 'words'} {allLanguages ? 'across all languages' : `in ${target.name}`}
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          <LuPlus aria-hidden="true" />
          Add word
        </button>
      </header>

      <div className="toolbar">
        <label className="search">
          <LuSearch aria-hidden="true" />
          <span className="sr-only">Search vocabulary</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words or translations" type="search" />
        </label>
        <div className="segmented" role="group" aria-label="Filter by status">
          {(['all', 'new', 'learning', 'mastered'] as Filter[]).map((f) => (
            <button key={f} type="button" className={filter === f ? 'is-active' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : STATUS_LABEL[f]} <small>{counts[f]}</small>
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={allLanguages} onChange={(e) => setAllLanguages(e.target.checked)} />
          All languages
        </label>
      </div>

      {scoped.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<LuBookOpen />}
            title={`No ${allLanguages ? '' : `${target.name} `}words yet`}
            action={
              <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
                <LuPlus aria-hidden="true" />
                Add your first word
              </button>
            }
          >
            Save words straight from a conversation with “Save words”, or add them here by hand. Every word becomes a flashcard.
          </EmptyState>
        </div>
      ) : visible.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<LuSearch />} title="Nothing matches">
            No saved word fits this search and filter. Clear the search or choose “All”.
          </EmptyState>
        </div>
      ) : (
        <ul className="vocab">
          {visible.map((v) => {
            const lang = getLanguage(v.lang);
            const status = vocabStatus(v);
            return (
              <li key={v.id} className="vocab__row">
                <Flag code={v.lang} size="sm" />
                <div className="vocab__main">
                  <strong lang={lang.code} dir={lang.rtl ? 'rtl' : 'ltr'}>
                    {v.term}
                  </strong>
                  <span>{v.translation || 'No translation yet'}</span>
                  {v.example && (
                    <em lang={lang.code} dir={lang.rtl ? 'rtl' : 'ltr'}>
                      {v.example}
                    </em>
                  )}
                </div>
                <div className="vocab__meta">
                  <span className={`status status--${status}`}>{STATUS_LABEL[status]}</span>
                  <small>{dueLabel(v)}</small>
                </div>
                <div className="vocab__actions">
                  <button type="button" className="icon-btn" onClick={() => speech.say(v.id, v.term, lang)} aria-label={speech.speakingId === v.id ? 'Stop audio' : `Listen to ${v.term}`}>
                    {speech.speakingId === v.id ? <LuSquare /> : <LuVolume2 />}
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setEditing(v)} aria-label={`Edit ${v.term}`}>
                    <LuPencil />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setDeleting(v)} aria-label={`Delete ${v.term}`}>
                    <LuTrash2 />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <WordDialog item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.term}”?`}
          message="The word and its review history will be removed."
          confirmLabel="Delete word"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            deleteVocab(deleting.id);
            toast('Word deleted', 'success');
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function WordDialog({ item, onClose }: { item: VocabItem | null; onClose: () => void }) {
  const { target, native, addVocab, updateVocab } = useStore();
  const { server } = useTutor();
  const toast = useToast();
  const [lang, setLang] = useState(item?.lang ?? target.code);
  const [term, setTerm] = useState(item?.term ?? '');
  const [translation, setTranslation] = useState(item?.translation ?? '');
  const [example, setExample] = useState(item?.example ?? '');
  const [busy, setBusy] = useState(false);
  const language = getLanguage(lang);

  const autoTranslate = async () => {
    if (!term.trim()) return;
    setBusy(true);
    try {
      setTranslation(await translateText(server, term, language, native));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Translation failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!term.trim()) return;
    if (item) {
      updateVocab(item.id, { term: term.trim(), translation: translation.trim(), example: example.trim() || undefined });
      toast('Changes saved', 'success');
      onClose();
      return;
    }
    const added = addVocab({ lang, term, translation, example });
    if (added) {
      toast(`Saved “${term.trim()}”`, 'success');
      onClose();
    } else {
      toast(`“${term.trim()}” is already in your ${language.name} vocabulary.`, 'error');
    }
  };

  return (
    <Modal
      title={item ? 'Edit word' : 'Add word'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={!term.trim()}>
            {item ? 'Save changes' : 'Save word'}
          </button>
        </>
      }
    >
      <div className="form">
        {!item && <LanguageSelect label="Language" value={lang} onChange={setLang} />}
        <label className="field">
          <span className="field__label">Word or phrase in {language.name}</span>
          <input className="input" value={term} onChange={(e) => setTerm(e.target.value)} lang={language.code} dir={language.rtl ? 'rtl' : 'ltr'} maxLength={120} autoFocus />
        </label>
        <div className="field">
          <label className="field__label" htmlFor="word-translation">
            Meaning in {native.name}
          </label>
          <div className="input-row">
            <input id="word-translation" className="input" value={translation} onChange={(e) => setTranslation(e.target.value)} maxLength={160} />
            {native.code !== language.code && (
              <button type="button" className="btn btn--ghost" onClick={() => void autoTranslate()} disabled={!term.trim() || busy}>
                {busy ? <LuLoaderCircle className="spin" aria-hidden="true" /> : <LuLanguages aria-hidden="true" />}
                Translate
              </button>
            )}
          </div>
        </div>
        <label className="field">
          <span className="field__label">Example sentence (optional)</span>
          <textarea className="input" rows={2} value={example} onChange={(e) => setExample(e.target.value)} lang={language.code} dir={language.rtl ? 'rtl' : 'ltr'} maxLength={240} />
        </label>
      </div>
    </Modal>
  );
}
