import { useState, type FormEvent } from 'react';
import { Button, Modal } from '../../components/ui';
import { ApiClientError } from '../../services/api-client';
import { moderationApi } from './moderation-service';
import type { ModerationTargetType, ReportReason } from './moderation.types';

const reasons: readonly { label: string; value: ReportReason }[] = [
  { label: 'Spam or misleading content', value: 'SPAM' },
  { label: 'Harassment or bullying', value: 'HARASSMENT' },
  { label: 'Inappropriate content', value: 'INAPPROPRIATE_CONTENT' },
  { label: 'Scam or fraud', value: 'SCAM' },
  { label: 'Impersonation', value: 'FAKE_PROFILE' },
  { label: 'Privacy violation', value: 'OTHER' },
  { label: 'Other', value: 'OTHER' },
];

export function ReportAction({
  disabled = false,
  targetId,
  targetType,
}: {
  disabled?: boolean;
  targetId: string;
  targetType: ModerationTargetType;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState<ReportReason>('SPAM');
  const [state, setState] = useState<'error' | 'idle' | 'saving' | 'success'>('idle');
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState('saving');
    try {
      await moderationApi.submit({
        description: description.trim() || null,
        reason,
        targetId,
        targetType,
      });
      setState('success');
      setMessage('Thank you. Your report was submitted for private moderator review.');
    } catch (error) {
      setState('error');
      setMessage(
        error instanceof ApiClientError ? error.message : 'The report could not be submitted.',
      );
    }
  };
  return (
    <>
      <Button disabled={disabled} onClick={() => setOpen(true)} type="button" variant="secondary">
        Report
      </Button>
      <Modal
        description="Reports are private and reviewed by authorized moderators."
        onClose={() => setOpen(false)}
        open={open}
        title="Report content"
      >
        {state === 'success' ? (
          <div>
            <p className="text-sm text-emerald-300" role="status">
              {message}
            </p>
            <Button className="mt-4" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
            <label className="cc-label">
              Reason
              <select
                className="cc-field"
                onChange={(event) => setReason(event.target.value as ReportReason)}
                value={reason}
              >
                {reasons.map((item) => (
                  <option key={`${item.value}:${item.label}`} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cc-label">
              Additional details (optional)
              <textarea
                className="cc-field min-h-28"
                maxLength={1000}
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </label>
            <p className="text-right text-xs text-slate-500">{description.length}/1000</p>
            {state === 'error' ? (
              <p className="text-sm text-rose-300" role="alert">
                {message}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setOpen(false)} type="button" variant="secondary">
                Cancel
              </Button>
              <Button disabled={state === 'saving'} type="submit">
                {state === 'saving' ? 'Submitting…' : 'Submit report'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
