import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import {
  formatShareMessage,
  canonicalRecordUrl,
  whatsappShareUrl,
  type ShareRecord,
} from './share';

interface ShareActionsProps {
  readonly className?: string;
  readonly record: ShareRecord;
  readonly includeRecordUrl?: boolean;
}

export function WhatsAppShareLink({
  record,
  label,
}: {
  readonly record: ShareRecord;
  readonly label?: string;
}) {
  const message = formatShareMessage(record);

  return (
    <a
      aria-label={`Share ${record.title} on WhatsApp`}
      className="grid size-10 place-items-center rounded-full border border-white/10 bg-slate-950/80 text-slate-200 shadow-lg transition hover:border-emerald-300/40 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
      href={whatsappShareUrl(message)}
      rel="noreferrer"
      target="_blank"
      title="Share on WhatsApp"
    >
      <Icon className="size-4" name="whatsapp" />
      {label ? <span>{label}</span> : null}
    </a>
  );
}

export function ShareActions({
  className = '',
  record,
  includeRecordUrl = false,
}: ShareActionsProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const url = useMemo(() => canonicalRecordUrl(record), [record]);
  const message = useMemo(() => {
    const formatted = formatShareMessage(record);
    return includeRecordUrl ? `${formatted}\n\n${url}` : formatted;
  }, [record, includeRecordUrl, url]);

  const copy = async (value: string, success: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(success);
    } catch {
      setFeedback('Copy is unavailable in this browser.');
    }
  };

  const nativeShare = async () => {
    if (!navigator.share) {
      await copy(message, 'Share message copied.');
      return;
    }
    try {
      await navigator.share({ text: message, title: record.title });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFeedback('Sharing is unavailable. You can copy the message instead.');
    }
  };

  return (
    <div className={`rounded-xl border border-white/[.08] bg-white/[.025] p-4 ${className}`.trim()}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Share</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          aria-label={`Share ${record.title} on WhatsApp`}
          className="cc-button cc-button--primary"
          href={whatsappShareUrl(message)}
          rel="noreferrer"
          target="_blank"
        >
          <Icon className="size-4" name="whatsapp" />
          WhatsApp
        </a>
        <button
          className="cc-button cc-button--secondary"
          onClick={() => void nativeShare()}
          type="button"
        >
          <Icon className="size-4" name="share" />
          Share
        </button>
        <button
          className="cc-button cc-button--secondary"
          onClick={() => void copy(url, 'Link copied.')}
          type="button"
        >
          <Icon className="size-4" name="copy" />
          Copy link
        </button>
        <button
          className="cc-button cc-button--secondary"
          onClick={() => void copy(message, 'Share message copied.')}
          type="button"
        >
          <Icon className="size-4" name="copy" />
          Copy message
        </button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-xs text-slate-400" role="status">
        {feedback}
      </p>
    </div>
  );
}
