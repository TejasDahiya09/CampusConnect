import { useProfileDraft } from './profile-draft-state';
import { useState, type FormEvent } from 'react';
import type { ProfileAchievement } from './profile.types';

interface AchievementDraft {
  readonly awardedAt: string;
  readonly description: string;
  readonly title: string;
}

interface AchievementsManagerProps {
  readonly achievements: readonly ProfileAchievement[];
  readonly disabled: boolean;
  readonly onCreate: (draft: AchievementDraft) => Promise<boolean>;
  readonly onDelete: (id: string) => Promise<boolean>;
  readonly onUpdate: (id: string, draft: AchievementDraft) => Promise<boolean>;
}

const emptyDraft: AchievementDraft = { awardedAt: '', description: '', title: '' };

export function AchievementsManager({
  achievements,
  disabled,
  onCreate,
  onDelete,
  onUpdate,
}: AchievementsManagerProps) {
  const [draft, setDraft] = useState<AchievementDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  const original = achievements.find((item) => item.id === editingId);
  useProfileDraft(
    'achievements',
    draft.title.trim() !== (original?.title ?? '').trim() ||
      draft.description.trim() !== (original?.description ?? '').trim() ||
      draft.awardedAt !== (original?.awardedAt ?? ''),
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

  const edit = (achievement: ProfileAchievement) => {
    setEditingId(achievement.id);
    setDraft({
      awardedAt: achievement.awardedAt ?? '',
      description: achievement.description ?? '',
      title: achievement.title,
    });
  };

  return (
    <div className="sp-edit-manager grid gap-5">
      {achievements.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
          Awards, certifications, and campus milestones can live here.
        </p>
      ) : (
        <div className="grid gap-3">
          {achievements.map((achievement) => (
            <article className="rounded-xl bg-slate-950/50 p-4" key={achievement.id}>
              <div className="sp-edit-achievement-head">
                <div>
                  <h3 className="font-medium text-white">{achievement.title}</h3>
                  {achievement.awardedAt ? (
                    <p className="mt-1 text-xs text-cyan-200">{achievement.awardedAt}</p>
                  ) : null}
                  {achievement.description ? (
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {achievement.description}
                    </p>
                  ) : null}
                </div>
                <div className="sp-edit-record-actions flex gap-2 text-xs">
                  <button
                    className="text-cyan-200 hover:text-white"
                    disabled={disabled}
                    onClick={() => edit(achievement)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="text-rose-300 hover:text-rose-200"
                    disabled={disabled}
                    onClick={() => {
                      if (window.confirm('Delete this achievement?')) void onDelete(achievement.id);
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <form className="grid gap-3 rounded-xl border border-white/10 p-4" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="sp-edit-field-label">
            Achievement title
            <input
              disabled={disabled}
              className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60"
              maxLength={160}
              minLength={2}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              aria-label="Achievement title"
              placeholder="Achievement title"
              required
              value={draft.title}
            />
          </label>
          <label className="sp-edit-field-label">
            Date <span className="sp-edit-optional">Optional</span>
            <input
              disabled={disabled}
              aria-label="Awarded date"
              className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-slate-300"
              onChange={(event) => setDraft({ ...draft, awardedAt: event.target.value })}
              type="date"
              value={draft.awardedAt}
            />
          </label>
        </div>
        <label className="sp-edit-field-label">
          Description <span className="sp-edit-optional">Optional</span>
          <textarea
            disabled={disabled}
            className="min-h-20 resize-y rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60"
            maxLength={1000}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            aria-label="Achievement description"
            placeholder="Optional description"
            value={draft.description}
          />
        </label>
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
            {editingId ? 'Update achievement' : 'Add achievement'}
          </button>
        </div>
      </form>
    </div>
  );
}
