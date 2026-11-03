import { useProfileDraft } from './profile-draft-state';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Button } from '../../components/ui';
import { ApiClientError } from '../../services/api-client';
import { analyzeResume } from './profile-service';
import type { ProfileSkill } from './profile.types';
import type { ResumeSkillSuggestion } from './resume-analysis.types';
import { validateResumeSelection } from './resume-file';

interface ResumeAnalyzerProps {
  readonly disabled: boolean;
  readonly existingSkills: readonly ProfileSkill[];
  readonly onAddSkill: (name: string, proficiency: null) => Promise<boolean>;
}

export function ResumeAnalyzer({ disabled, existingSkills, onAddSkill }: ResumeAnalyzerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [skills, setSkills] = useState<readonly ResumeSkillSuggestion[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [state, setState] = useState<'idle' | 'processing' | 'saving'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  useProfileDraft('resume-selection', file !== null || state !== 'idle');
  const existing = new Set(existingSkills.map(({ name }) => name.trim().toLocaleLowerCase()));
  const available = skills.filter(({ name }) => !existing.has(name.toLocaleLowerCase()));

  const choose = (next: File | undefined) => {
    if (!next) return;
    const issue = validateResumeSelection(next);
    setMessage(issue);
    if (issue) return;
    setFile(next);
    setSkills([]);
    setSelected(new Set());
  };
  const onFile = (event: ChangeEvent<HTMLInputElement>) => choose(event.target.files?.[0]);
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    choose(event.dataTransfer.files[0]);
  };
  const analyze = async () => {
    if (!file) return;
    setState('processing');
    setMessage(null);
    try {
      const result = await analyzeResume(file);
      setSkills(result.skills);
      setSelected(
        new Set(
          result.skills
            .filter(({ name }) => !existing.has(name.toLocaleLowerCase()))
            .map(({ name }) => name),
        ),
      );
      setMessage(
        result.skills.length === 0
          ? 'No supported skills were found. Your profile was not changed.'
          : null,
      );
    } catch (error) {
      setMessage(
        error instanceof ApiClientError ? error.message : 'Resume analysis could not be completed.',
      );
    } finally {
      setState('idle');
    }
  };
  const addSelected = async () => {
    const choices = available.filter(({ name }) => selected.has(name));
    setState('saving');
    let added = 0;
    for (const skill of choices) {
      if (await onAddSkill(skill.name, null)) added += 1;
      else break;
    }
    setState('idle');
    setMessage(
      added === choices.length
        ? `${added} skill${added === 1 ? '' : 's'} added to your profile.`
        : `${added} skills were added before an update failed. You can retry the remaining selections.`,
    );
  };

  return (
    <div className="grid gap-4">
      <div
        className="rounded-xl border border-dashed border-white/15 bg-white/[.025] p-5 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <input accept=".pdf,.docx" className="sr-only" onChange={onFile} ref={input} type="file" />
        <p className="font-medium">Drop a PDF or DOCX resume here</p>
        <p className="mt-1 text-sm text-slate-400">
          Processed privately and discarded after analysis. Maximum 5 MiB.
        </p>
        <Button
          className="mt-4"
          disabled={disabled || state !== 'idle'}
          onClick={() => input.current?.click()}
          type="button"
          variant="secondary"
        >
          Upload resume
        </Button>
      </div>
      {file ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3 text-sm">
          <span className="min-w-0 truncate">
            {file.name} · {(file.size / 1024).toFixed(1)} KiB
          </span>
          <div className="flex gap-2">
            <Button
              disabled={disabled || state !== 'idle'}
              onClick={() => void analyze()}
              type="button"
            >
              {state === 'processing' ? 'Analyzing…' : 'Analyze resume'}
            </Button>
            <Button
              disabled={state !== 'idle'}
              onClick={() => {
                setFile(null);
                setSkills([]);
                setSelected(new Set());
                setMessage(null);
                if (input.current) input.current.value = '';
              }}
              type="button"
              variant="ghost"
            >
              Remove
            </Button>
          </div>
        </div>
      ) : null}
      {state === 'processing' ? (
        <p aria-live="polite" className="text-sm text-indigo-200">
          Analyzing your resume securely…
        </p>
      ) : null}
      {skills.length > 0 ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Review suggested skills</p>
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setSelected(new Set(available.map(({ name }) => name)))}
                type="button"
              >
                Select all
              </button>
              <button onClick={() => setSelected(new Set())} type="button">
                Deselect all
              </button>
            </div>
          </div>
          {skills.map((skill) => {
            const alreadyAdded = existing.has(skill.name.toLocaleLowerCase());
            return (
              <label
                className="flex items-start gap-3 rounded-xl border border-white/10 p-3"
                key={skill.name}
              >
                <input
                  checked={!alreadyAdded && selected.has(skill.name)}
                  disabled={alreadyAdded || state === 'saving'}
                  onChange={(event) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(skill.name);
                      else next.delete(skill.name);
                      return next;
                    })
                  }
                  type="checkbox"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    <span>{skill.name}</span>
                    <span className="cc-badge cc-badge--neutral">
                      {alreadyAdded ? 'Already added' : skill.category}
                    </span>
                    <span className="text-xs text-slate-500">{skill.confidence} evidence</span>
                  </span>
                  <span className="mt-1 block text-sm text-slate-400">“{skill.evidence}”</span>
                </span>
              </label>
            );
          })}
          <Button
            disabled={disabled || state !== 'idle' || selected.size === 0}
            onClick={() => void addSelected()}
            type="button"
          >
            {state === 'saving' ? 'Adding skills…' : 'Add selected skills'}
          </Button>
        </div>
      ) : null}
      {message ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
