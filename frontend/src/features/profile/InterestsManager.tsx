import { useProfileDraft } from './profile-draft-state';
import { useState, type FormEvent } from 'react';
import type { ProfileInterest, ProfileOptions } from './profile.types';

interface InterestsManagerProps {
  readonly disabled: boolean;
  readonly interests: readonly ProfileInterest[];
  readonly onAdd: (name: string) => Promise<boolean>;
  readonly onRemove: (id: string) => Promise<boolean>;
  readonly options: ProfileOptions;
}

export function InterestsManager({
  disabled,
  interests,
  onAdd,
  onRemove,
  options,
}: InterestsManagerProps) {
  const [name, setName] = useState('');

  useProfileDraft('interests-add', Boolean(name.trim()));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onAdd(name).then((saved) => {
      if (saved) setName('');
    });
  };

  return (
    <div className="sp-edit-manager grid gap-4">
      <div className="flex flex-wrap gap-2">
        {interests.length === 0 ? (
          <p className="w-full rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
            No interests yet. Add a few topics you care about.
          </p>
        ) : (
          interests.map((interest) => (
            <span
              className="inline-flex items-center gap-2 rounded-full bg-violet-400/10 px-3 py-1.5 text-sm text-violet-200"
              key={interest.id}
            >
              {interest.name}
              <button
                aria-label={`Remove ${interest.name}`}
                className="text-violet-300/70 hover:text-white"
                disabled={disabled}
                onClick={() => void onRemove(interest.id)}
                type="button"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <form className="flex gap-3" onSubmit={submit}>
        <label className="sp-edit-field-label min-w-0 flex-1">
          Interest
          <input
            disabled={disabled}
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60"
            list="profile-interest-options"
            maxLength={80}
            minLength={2}
            onChange={(event) => setName(event.target.value)}
            aria-label="Interest name"
            placeholder="Add an interest"
            required
            value={name}
          />
          <datalist id="profile-interest-options">
            {options.interests.map((interest) => (
              <option key={interest.id} value={interest.name} />
            ))}
          </datalist>
        </label>
        <button
          className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-50"
          disabled={disabled}
          type="submit"
        >
          Add
        </button>
      </form>
    </div>
  );
}
