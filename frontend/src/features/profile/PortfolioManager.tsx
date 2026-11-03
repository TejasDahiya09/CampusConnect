import { useProfileDraft } from './profile-draft-state';
import { useState, type FormEvent } from 'react';
import { Icon } from '../../components/Icon';
import { isLinkedInProfileUrl } from './linkedin';
import type { ProfilePortfolioLink } from './profile.types';

interface PortfolioDraft {
  readonly label: string;
  readonly sortOrder: string;
  readonly url: string;
}

interface PortfolioManagerProps {
  readonly disabled: boolean;
  readonly links: readonly ProfilePortfolioLink[];
  readonly onCreate: (draft: PortfolioDraft) => Promise<boolean>;
  readonly onDelete: (id: string) => Promise<boolean>;
  readonly onUpdate: (id: string, draft: PortfolioDraft) => Promise<boolean>;
}

const emptyDraft: PortfolioDraft = { label: '', sortOrder: '0', url: '' };

export function PortfolioManager({
  disabled,
  links,
  onCreate,
  onDelete,
  onUpdate,
}: PortfolioManagerProps) {
  const [draft, setDraft] = useState<PortfolioDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  const original = links.find((item) => item.id === editingId);
  useProfileDraft(
    'portfolio',
    draft.label.trim() !== (original?.label ?? '').trim() ||
      draft.url.trim() !== (original?.url ?? '').trim() ||
      Number(draft.sortOrder || 0) !== (original?.sortOrder ?? 0),
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const action = editingId === null ? onCreate(draft) : onUpdate(editingId, draft);
    void action.then((saved) => {
      if (saved) {
        setDraft(emptyDraft);
        setEditingId(null);
      }
    });
  };

  return (
    <div className="sp-edit-manager grid gap-5">
      {links.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
          Add a LinkedIn profile, portfolio, GitHub profile, project, or personal site.
        </p>
      ) : (
        <div className="grid gap-2">
          {links.map((link) => (
            <div className="flex items-center gap-3 rounded-xl bg-slate-950/50 p-3" key={link.id}>
              <a
                aria-label={
                  isLinkedInProfileUrl(link.url) ? 'View LinkedIn profile' : `View ${link.label}`
                }
                className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm text-cyan-200 hover:text-cyan-100"
                href={link.url}
                rel="noreferrer"
                target="_blank"
              >
                {isLinkedInProfileUrl(link.url) ? (
                  <Icon className="size-4 shrink-0" name="linkedin" />
                ) : null}
                <span className="min-w-0 truncate">
                  <span className="font-medium">{link.label}</span>
                  <span className="ml-2 text-xs text-slate-500">{link.url}</span>
                </span>
              </a>
              <button
                className="text-xs text-cyan-200 hover:text-white"
                disabled={disabled}
                onClick={() => {
                  setEditingId(link.id);
                  setDraft({
                    label: link.label,
                    sortOrder: link.sortOrder.toString(),
                    url: link.url,
                  });
                }}
                type="button"
              >
                Edit
              </button>
              <button
                className="text-xs text-rose-300 hover:text-rose-200"
                disabled={disabled}
                onClick={() => {
                  if (window.confirm('Delete this portfolio link?')) void onDelete(link.id);
                }}
                type="button"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
      <form className="grid gap-3 rounded-xl border border-white/10 p-4" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-[0.7fr_1.3fr_6rem]">
          <label className="sp-edit-field-label">
            Link name
            <input
              disabled={disabled}
              className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60"
              maxLength={80}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              aria-label="Link label"
              placeholder="LinkedIn, portfolio, or project"
              required
              value={draft.label}
            />
          </label>
          <label className="sp-edit-field-label">
            URL
            <input
              disabled={disabled}
              className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60"
              maxLength={2048}
              onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              placeholder="https://…"
              required
              aria-label="Link URL"
              type="url"
              value={draft.url}
            />
          </label>
          <label className="sp-edit-field-label">
            Display order
            <input
              disabled={disabled}
              aria-label="Sort order"
              className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white"
              max={10000}
              min={0}
              onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
              type="number"
              value={draft.sortOrder}
            />
            <span className="sp-edit-optional">Lower numbers appear first.</span>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          {editingId ? (
            <button
              className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyDraft);
              }}
              type="button"
            >
              Cancel
            </button>
          ) : null}
          <button
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={disabled}
            type="submit"
          >
            {editingId ? 'Update link' : 'Add link'}
          </button>
        </div>
      </form>
    </div>
  );
}
