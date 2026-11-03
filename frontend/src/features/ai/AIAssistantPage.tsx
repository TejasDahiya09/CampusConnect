import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, Card, EmptyState, PageHeader } from '../../components/ui';
import { ApiClientError } from '../../services/api-client';
import { askAssistant } from './assistant-service';
import { useAuth } from '../auth/useAuth';
import './assistant.css';
import type { AssistantAnswer, AssistantCitation } from './assistant.types';

interface ChatMessage {
  readonly answer?: AssistantAnswer;
  readonly id: number;
  readonly question?: string;
  readonly history?: readonly string[];
  readonly role: 'assistant' | 'user';
  readonly text: string;
}

const suggestions = [
  'What is CampusConnect?',
  'Show me calculators available in Marketplace.',
  'I lost my bag.',
  'How can I find project teammates?',
  'How can I find student services?',
] as const;

const sourceLabels: Readonly<Record<AssistantCitation['sourceType'], string>> = {
  LOST_FOUND: 'Lost & Found',
  MARKETPLACE: 'Marketplace',
  SERVICE: 'Services',
  TEAMUP: 'TeamUp',
};

const supportEmail = 'campusconnectteams@gmail.com';

const assistantText = (text: string) => {
  const parts = text.split(supportEmail);
  if (parts.length === 1) return text;
  return parts.flatMap((part, index) => [
    part,
    ...(index < parts.length - 1
      ? [
          <a
            className="font-medium text-indigo-300 underline decoration-indigo-300/40 underline-offset-2 hover:text-indigo-200"
            href={`mailto:${supportEmail}`}
            key={`support-email-${index}`}
          >
            {supportEmail}
          </a>,
        ]
      : []),
  ]);
};

const errorMessage = (error: unknown) => {
  if (error instanceof ApiClientError) {
    if (error.status === 429) return 'Too many requests. Please wait a minute before retrying.';
    if (error.status === 403) return 'Your account cannot use the Assistant right now.';
    if (error.status === 400) return 'Please use a question between 2 and 300 characters.';
    if (error.status === 401) return 'Your session has expired. Please sign in again.';
    if (error.code === 'ASSISTANT_TIMEOUT' || error.code === 'INVALID_ASSISTANT_RESPONSE')
      return error.message;
  }
  return 'The Campus Assistant could not be reached. Please try again when you are ready.';
};

export function AIAssistantPage() {
  const { applicationUser } = useAuth();
  return <AssistantConversation key={applicationUser?.id ?? 'signed-out'} />;
}

function AssistantConversation() {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const nextMessageId = useRef(1);
  const epoch = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const requestActive = useRef(false);
  const workspace = useRef<HTMLDivElement>(null);
  const historyPanel = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const panel = historyPanel.current;
    if (panel && followLatest.current)
      panel.scrollTo({
        top: panel.scrollHeight,
        behavior: 'instant',
      });
  }, [messages, pending]);

  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const node = workspace.current,
        page = node?.parentElement,
        main = page?.closest('main');
      if (!node || !page || !main) return;
      const viewport = window.visualViewport;
      const available =
        (viewport?.height ?? innerHeight) -
        (node.getBoundingClientRect().top + scrollY) -
        parseFloat(getComputedStyle(page).paddingBottom) -
        parseFloat(getComputedStyle(main).paddingBottom);
      const footer = node.querySelector('.assistant-compose-area');
      const lineHeight =
        parseFloat(getComputedStyle(historyPanel.current ?? node).lineHeight) || 24;
      const minimum = (footer?.getBoundingClientRect().height ?? 0) + lineHeight * 3;
      node.style.setProperty('--assistant-workspace-height', `${Math.max(minimum, available)}px`);
      const panel = historyPanel.current;
      if (panel && followLatest.current) panel.scrollTop = panel.scrollHeight;
    };
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(resize);
    const header = workspace.current?.parentElement?.querySelector('header');
    const footer = workspace.current?.querySelector('.assistant-compose-area');
    if (header) observer.observe(header);
    if (footer) observer.observe(footer);
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(
    () => () => {
      epoch.current += 1;
      activeController.current?.abort();
    },
    [],
  );

  const ask = async (question: string, retryId?: number, retryHistory?: readonly string[]) => {
    const normalized = question.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (normalized.length < 2 || requestActive.current) return;
    requestActive.current = true;
    followLatest.current = true;
    setShowJump(false);
    const generation = epoch.current;
    const controller = new AbortController();
    activeController.current = controller;
    const history = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.text)
      .slice(-4);
    setPending(true);
    setDraft('');
    if (retryId !== undefined) setMessages((current) => current.filter((m) => m.id !== retryId));
    else
      setMessages((current) => [
        ...current,
        { id: nextMessageId.current++, role: 'user', text: normalized },
      ]);

    try {
      const answer = await askAssistant({
        question: normalized,
        history: retryHistory ?? history,
        signal: controller.signal,
      });
      if (generation !== epoch.current) return;
      setMessages((current) => [
        ...current,
        {
          answer,
          id: nextMessageId.current++,
          ...(answer.status === 'unavailable'
            ? { question: normalized, history: retryHistory ?? history }
            : {}),
          role: 'assistant',
          text: answer.answer,
        },
      ]);
    } catch (error) {
      if (generation !== epoch.current) return;
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId.current++,
          ...(error instanceof ApiClientError && [400, 401, 403].includes(error.status)
            ? {}
            : { question: normalized, history: retryHistory ?? history }),
          role: 'assistant',
          text: errorMessage(error),
        },
      ]);
    } finally {
      if (generation === epoch.current) {
        requestActive.current = false;
        setPending(false);
        input.current?.focus({ preventScroll: true });
      }
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask(draft);
    }
  };

  const clear = () => {
    epoch.current += 1;
    activeController.current?.abort();
    requestActive.current = false;
    setPending(false);
    followLatest.current = true;
    setShowJump(false);
    setMessages([]);
    setDraft('');
    input.current?.focus({ preventScroll: true });
  };

  return (
    <div className="cc-page campus-assistant">
      <PageHeader
        actions={
          <div className="assistant-header-actions">
            <Button
              className="assistant-new-mobile"
              icon="plus"
              onClick={clear}
              variant="secondary"
            >
              New conversation
            </Button>
            <Button
              aria-label="Clear conversation"
              disabled={!pending && messages.length === 0 && !draft}
              onClick={clear}
              variant="secondary"
            >
              <span className="assistant-clear-long">Clear conversation</span>
              <span className="assistant-clear-short">Clear</span>
            </Button>
          </div>
        }
        description="Get campus guidance or find listings, reports, projects and student services."
        title="Campus Assistant"
      />
      <div
        ref={workspace}
        className="cc-chat-workspace cc-workspace mt-6 grid overflow-hidden rounded-2xl"
      >
        <aside className="hidden border-r border-white/[.07] p-4 lg:block">
          <Button className="w-full" icon="plus" onClick={clear}>
            New conversation
          </Button>
          <p className="assistant-suggestion-heading">Try asking</p>
          <div className="mt-2 grid gap-1">
            {suggestions.map((suggestion) => (
              <button
                className="rounded-lg px-3 py-2.5 text-left text-xs text-slate-400 hover:bg-white/[.04] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending}
                key={suggestion}
                onClick={() => void ask(suggestion)}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>
          <Card className="assistant-sidebar-note">
            <div className="flex items-center gap-2">
              <Icon className="size-4 text-indigo-300" name="shield" />
              <span className="text-xs font-semibold">Grounded by design</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Campus guidance and eligible records. Chat stays temporary; the last four questions
              support follow-ups.
            </p>
          </Card>
        </aside>
        <section className="flex min-w-0 flex-col">
          <div className="assistant-history-frame">
            <div
              ref={historyPanel}
              tabIndex={0}
              role="region"
              aria-label="Conversation messages"
              onScroll={() => {
                const panel = historyPanel.current;
                if (panel) {
                  followLatest.current =
                    panel.scrollHeight - panel.scrollTop - panel.clientHeight < 48;
                  setShowJump(!followLatest.current);
                }
              }}
              className="cc-chat-scroll flex-1 overflow-y-auto p-4 sm:p-6"
            >
              <div
                aria-live="polite"
                className={`assistant-transcript mx-auto max-w-3xl space-y-5 ${messages.length === 0 ? 'is-empty' : ''}`}
              >
                {messages.length === 0 ? (
                  <EmptyState
                    description="Choose a suggestion, ask how CampusConnect works, or search public campus records."
                    icon="ai"
                    title="How can I help on campus?"
                  />
                ) : (
                  messages.map((message) => (
                    <div
                      className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      key={message.id}
                    >
                      {message.role === 'assistant' ? (
                        <span className="cc-icon-box shrink-0">
                          <Icon className="size-5" name="ai" />
                        </span>
                      ) : null}
                      <div
                        className={`cc-message-bubble min-w-0 max-w-[90%] overflow-hidden rounded-2xl px-4 py-3 text-sm leading-7 sm:max-w-[85%] ${message.role === 'user' ? 'rounded-br-md bg-indigo-400 text-slate-950' : 'rounded-bl-md bg-white/[.055] text-slate-300'}`}
                      >
                        {message.answer ? (
                          <p className="assistant-source-label">
                            {message.answer.provider
                              ? 'AI-assisted'
                              : message.answer.responseType === 'grounded'
                                ? 'Campus records'
                                : message.answer.status === 'unavailable'
                                  ? 'Service notice'
                                  : 'Campus guide'}
                          </p>
                        ) : null}
                        <p className="whitespace-pre-wrap break-words">
                          {assistantText(message.text)}
                        </p>
                        {message.answer?.status === 'answered' &&
                        message.answer.citations.length > 0 ? (
                          <div className="mt-4 border-t border-white/[.08] pt-3">
                            <p className="text-[.65rem] font-bold uppercase tracking-wider text-slate-500">
                              Related campus records
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {message.answer.citations.map((citation) => (
                                <Link
                                  aria-label={`Open ${citation.title} in ${sourceLabels[citation.sourceType]}${citation.details ? `, ${citation.details}` : ''}`}
                                  className="assistant-record-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                                  key={citation.sourceId}
                                  to={citation.route}
                                >
                                  <span className="assistant-record-title">{citation.title}</span>
                                  <span className="assistant-record-meta">
                                    {sourceLabels[citation.sourceType]}
                                    {citation.details ? ` | ${citation.details}` : ''}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {message.answer?.actions?.length ? (
                          <nav className="assistant-actions" aria-label="Suggested next steps">
                            {message.answer.actions.map((action) => (
                              <Link key={action.route} to={action.route}>
                                {action.label}
                                <span aria-hidden="true"> &rarr;</span>
                              </Link>
                            ))}
                          </nav>
                        ) : null}
                        {message.question ? (
                          <Button
                            className="mt-3"
                            disabled={pending}
                            onClick={() =>
                              void ask(message.question ?? '', message.id, message.history)
                            }
                            variant="secondary"
                          >
                            Retry
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
                {pending ? (
                  <div
                    aria-label="Campus Assistant is reviewing sources"
                    className="flex items-center gap-3 text-sm text-slate-500"
                    role="status"
                  >
                    <span className="cc-icon-box">
                      <Icon className="size-5" name="ai" />
                    </span>
                    <span aria-hidden="true" className="flex gap-1">
                      <i className="size-1.5 motion-safe:animate-pulse rounded-full bg-indigo-300" />
                      <i className="size-1.5 motion-safe:animate-pulse rounded-full bg-indigo-300 [animation-delay:120ms]" />
                      <i className="size-1.5 motion-safe:animate-pulse rounded-full bg-indigo-300 [animation-delay:240ms]" />
                    </span>
                    Reviewing authorized CampusConnect sources…
                  </div>
                ) : null}
              </div>
            </div>
            {showJump ? (
              <Button
                className="assistant-jump"
                onClick={() => {
                  followLatest.current = true;
                  historyPanel.current?.scrollTo({
                    top: historyPanel.current.scrollHeight,
                    behavior: 'instant',
                  });
                  setShowJump(false);
                  input.current?.focus({ preventScroll: true });
                }}
                variant="secondary"
              >
                Jump to latest
              </Button>
            ) : null}
          </div>
          <div className="assistant-compose-area border-t border-white/[.07] p-4 sm:p-5">
            <div className="mx-auto max-w-3xl">
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                {suggestions.map((suggestion) => (
                  <button
                    className="shrink-0 rounded-full border border-white/[.08] px-3 py-2 text-xs text-slate-400 hover:border-indigo-300/25 hover:text-slate-200 disabled:opacity-50"
                    disabled={pending}
                    key={suggestion}
                    onClick={() => void ask(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <form className="cc-composer flex items-end gap-2" onSubmit={submit}>
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Ask the Campus Assistant</span>
                  <textarea
                    aria-describedby="assistant-input-help"
                    className="cc-field min-h-11 max-h-32 resize-y"
                    disabled={pending}
                    maxLength={300}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Your question"
                    ref={input}
                    rows={1}
                    value={draft}
                  />
                </label>
                <Button
                  aria-label="Send question to Campus Assistant"
                  disabled={pending || draft.trim().length < 2}
                  type="submit"
                >
                  <Icon className="size-4" name="arrow" />
                  Send
                </Button>
              </form>
              <p
                className="mt-2 text-center text-[.65rem] text-slate-600"
                id="assistant-input-help"
              >
                Enter to send · Shift+Enter for a new line · Temporary conversation, no saved chat
                history
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
