import { useProfileDraft } from './profile-draft-state';
import { useState, type FormEvent } from 'react';
import type { ProfileOptions, ProfileSkill } from './profile.types';

interface SkillsManagerProps {
  readonly disabled: boolean;
  readonly onAdd: (name: string, proficiency: number | null) => Promise<boolean>;
  readonly onRemove: (id: string) => Promise<boolean>;
  readonly onUpdate: (id: string, proficiency: number | null) => Promise<boolean>;
  readonly options: ProfileOptions;
  readonly skills: readonly ProfileSkill[];
}

export function SkillsManager({
  disabled,
  onAdd,
  onRemove,
  onUpdate,
  options,
  skills,
}: SkillsManagerProps) {
  const [name, setName] = useState('');
  const [proficiency, setProficiency] = useState('');

  useProfileDraft('skills-add', Boolean(name.trim() || proficiency));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onAdd(name, proficiency ? Number(proficiency) : null).then((saved) => {
      if (saved) {
        setName('');
        setProficiency('');
      }
    });
  };

  return (
    <div className="sp-edit-manager grid gap-4">
      {skills.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
          Add a skill to help classmates understand what you know.
        </p>
      ) : (
        <div className="sp-edit-skill-list" role="region" aria-label="Your skills" tabIndex={0}>
          {skills.map((skill) => (
            <div className="sp-edit-skill-row" key={skill.id}>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                {skill.name}
              </span>
              <select
                aria-label={`${skill.name} proficiency`}
                className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                disabled={disabled}
                onChange={(event) =>
                  void onUpdate(skill.id, event.target.value ? Number(event.target.value) : null)
                }
                value={skill.proficiency ?? ''}
              >
                <option value="">Unrated</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    Level {value}
                  </option>
                ))}
              </select>
              <button
                className="text-xs text-rose-300 hover:text-rose-200"
                disabled={disabled}
                onClick={() => {
                  if (window.confirm('Remove ' + skill.name + ' from your skills?'))
                    void onRemove(skill.id);
                }}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={submit}>
        <label className="sp-edit-field-label">
          Skill name
          <input
            disabled={disabled}
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60"
            list="profile-skill-options"
            maxLength={80}
            minLength={2}
            onChange={(event) => setName(event.target.value)}
            aria-label="Skill name"
            placeholder="Add a skill"
            required
            value={name}
          />
          <datalist id="profile-skill-options">
            {options.skills.map((skill) => (
              <option key={skill.id} value={skill.name} />
            ))}
          </datalist>
        </label>
        <label className="sp-edit-field-label">
          Proficiency
          <select
            disabled={disabled}
            aria-label="New skill proficiency"
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-200"
            onChange={(event) => setProficiency(event.target.value)}
            value={proficiency}
          >
            <option value="">Unrated</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                Level {value}
              </option>
            ))}
          </select>
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
