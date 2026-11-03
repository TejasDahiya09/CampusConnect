import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Skeleton } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { TeamUpFeaturedConsent } from './TeamUpFeaturedConsent';
import { ApiClientError } from '../../services/api-client';
import { teamUpApi } from './teamup-service';
import type { TeamUpDraft, TeamUpProject } from './teamup.types';
import { addProjectSkills, changedProjectFields, validateProjectDraft } from './teamup-management';
import './teamup-management.css';

const errorMessage = (reason: unknown) =>
  reason instanceof ApiClientError
    ? reason.message
    : 'The request could not be completed. Your changes are still here; please try again.';
const blank: TeamUpDraft = {
  title: '',
  description: '',
  category: '',
  deadline: '',
  requiredSkills: [],
  maxMembers: 5,
  featuredOnLanding: false,
};
export function TeamUpCreatePage() {
  return <ProjectEditor />;
}
export function TeamUpEditPage() {
  const { id = '' } = useParams();
  return <ProjectEditor key={id} id={id} />;
}
function ProjectEditor({ id }: { readonly id?: string }) {
  const [record, setRecord] = useState<TeamUpProject | null>(null),
    [error, setError] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    let current = true;
    teamUpApi
      .getProject(id)
      .then((value) => {
        if (current) {
          setRecord(value);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (current) setError(errorMessage(reason));
      });
    return () => {
      current = false;
    };
  }, [id, attempt]);
  const back = (
    <Link className="tu-manage-back" to={id ? `/teamup/${id}` : '/teamup'}>
      <Icon name="arrow" /> {id ? 'Back to project' : 'Back to TeamUp'}
    </Link>
  );
  if (id && error)
    return (
      <div className="cc-page tu-manage tu-editor">
        {back}
        <section className="tu-manage-state" role="alert">
          <h1>Project unavailable</h1>
          <p>{error}</p>
          <Button
            onClick={() => {
              setError(null);
              setAttempt((value) => value + 1);
            }}
          >
            Retry project
          </Button>
        </section>
      </div>
    );
  if (id && !record)
    return (
      <div className="cc-page tu-manage tu-editor" aria-busy="true">
        {back}
        <p role="status">Loading project…</p>
        <Skeleton className="tu-editor-skeleton" />
      </div>
    );
  const blocked =
    record && !record.viewerIsOwner
      ? 'Only the project owner can edit this project.'
      : record && !['OPEN', 'FULL'].includes(record.status)
        ? 'Completed and archived projects cannot be edited.'
        : record && typeof record.featuredOnLanding !== 'boolean'
          ? 'This owner response is missing the Featured Posts consent value. Editing is disabled to avoid changing your consent unintentionally.'
          : null;
  if (blocked)
    return (
      <div className="cc-page tu-manage tu-editor">
        {back}
        <section className="tu-manage-state">
          <h1>Project is not editable</h1>
          <p>{blocked}</p>
        </section>
      </div>
    );
  return (
    <div className="cc-page tu-manage tu-editor">
      {back}
      <header className="tu-manage-header">
        <div>
          <span className="tu-manage-eyebrow">
            TeamUp · {id ? 'Owner workspace' : 'A new collaboration'}
          </span>
          <h1>{id ? 'Edit project' : 'Create a project'}</h1>
          <p>
            {id
              ? 'Refine the plan for your team. Membership and application decisions stay in the project workspace.'
              : 'Share your idea, outline the skills you need, and find your next teammates.'}
          </p>
        </div>
      </header>
      <ProjectForm
        key={id ?? 'new'}
        project={record}
        initial={
          record
            ? {
                title: record.title,
                description: record.description,
                category: record.category ?? '',
                deadline: record.deadline ?? '',
                requiredSkills: record.requiredSkills,
                maxMembers: record.maxMembers,
                featuredOnLanding: record.featuredOnLanding as boolean,
              }
            : blank
        }
      />
    </div>
  );
}
function ProjectForm({
  initial,
  project,
}: {
  readonly initial: TeamUpDraft;
  readonly project: TeamUpProject | null;
}) {
  const navigate = useNavigate(),
    lock = useRef(false),
    alive = useRef(true),
    summary = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(initial),
    [skillInput, setSkillInput] = useState(''),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [serverError, setServerError] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (Object.keys(errors).length || serverError) summary.current?.focus();
  }, [errors, serverError]);
  const minimum = Math.max(2, project?.currentMemberCount ?? 2);
  const hasChanges =
    Object.keys(changedProjectFields(initial, draft)).length > 0 || !!skillInput.trim();
  const addSkills = () => {
    const result = addProjectSkills(draft.requiredSkills, skillInput);
    if (result.error) {
      setErrors((value) => ({ ...value, requiredSkills: result.error }));
      return;
    }
    setDraft((value) => ({ ...value, requiredSkills: result.skills }));
    setSkillInput('');
    setErrors((value) => ({ ...value, requiredSkills: '' }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    let next = draft;
    if (skillInput.trim()) {
      const result = addProjectSkills(draft.requiredSkills, skillInput);
      if (result.error) {
        setErrors({ requiredSkills: result.error });
        return;
      }
      next = { ...draft, requiredSkills: result.skills };
      setDraft(next);
      setSkillInput('');
    }
    const invalid = validateProjectDraft(next, minimum);
    setErrors(invalid);
    setServerError(null);
    if (Object.keys(invalid).length) return;
    const patch = changedProjectFields(initial, next);
    if (project && !Object.keys(patch).length) {
      setServerError('No changes to save. Update a field or return to the project.');
      return;
    }
    lock.current = true;
    setSaving(true);
    try {
      const saved = project
        ? await teamUpApi.updateProject(project.id, patch)
        : await teamUpApi.createProject(next);
      if (alive.current) void navigate(`/teamup/${saved.id}`);
    } catch (reason) {
      lock.current = false;
      if (alive.current) {
        setServerError(errorMessage(reason));
        setSaving(false);
      }
    }
  };
  const field = (name: keyof TeamUpDraft) => ({
    id: `tu-form-${name}`,
    'aria-invalid': !!errors[name],
    'aria-describedby': errors[name] ? `tu-error-${name}` : undefined,
  });
  const issue = (name: keyof TeamUpDraft) =>
    errors[name] ? (
      <p className="tu-field-error" id={`tu-error-${name}`}>
        {errors[name]}
      </p>
    ) : null;
  return (
    <form
      className="tu-project-form"
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-busy={saving}
    >
      {Object.values(errors).some(Boolean) || serverError ? (
        <div className="tu-form-errors" role="alert" tabIndex={-1} ref={summary}>
          <h2>{serverError ? 'Couldn’t save the project' : 'Check the highlighted fields'}</h2>
          {serverError ? (
            <p>{serverError}</p>
          ) : (
            <ul>
              {Object.entries(errors)
                .filter(([, value]) => value)
                .map(([name, value]) => (
                  <li key={name}>
                    <a href={`#tu-form-${name}`}>{value}</a>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : null}
      <fieldset disabled={saving}>
        <legend>
          <span>01</span> Project basics
        </legend>
        <p className="tu-section-help">
          A clear purpose helps students decide where they can contribute.
        </p>
        <div className="tu-form-two">
          <label className="cc-label" htmlFor="tu-form-title">
            <span className="tu-label-line">
              Project title <small className="tu-required">Required</small>
            </span>
            <input
              {...field('title')}
              className="cc-field"
              required
              minLength={3}
              maxLength={180}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
            {issue('title')}
          </label>
          <label className="cc-label" htmlFor="tu-form-category">
            <span className="tu-label-line">
              Category <small className="tu-optional">Optional</small>
            </span>
            <input
              {...field('category')}
              className="cc-field"
              maxLength={100}
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            />
            {issue('category')}
          </label>
        </div>
        <label className="cc-label" htmlFor="tu-form-description">
          <span className="tu-label-line">
            Project description <small className="tu-required">Required</small>
          </span>
          <textarea
            {...field('description')}
            className="cc-field"
            required
            minLength={20}
            maxLength={5000}
            rows={5}
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
          <span className="tu-field-help">
            Describe the goal, what you’ll build, and how teammates can help. 20–5,000 characters.
          </span>
          {issue('description')}
        </label>
      </fieldset>
      <fieldset disabled={saving}>
        <legend>
          <span>02</span> Team requirements
        </legend>
        <div className="tu-form-two">
          <div>
            <label className="cc-label" htmlFor="tu-form-requiredSkills">
              <span className="tu-label-line">
                Required skills <small className="tu-optional">Optional</small>
              </span>
            </label>
            <div className="tu-skill-entry">
              <input
                {...field('requiredSkills')}
                className="cc-field"
                value={skillInput}
                maxLength={611}
                onChange={(event) => setSkillInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    if (skillInput.trim()) addSkills();
                  }
                }}
                placeholder="Type a skill"
              />
              <Button type="button" variant="secondary" onClick={addSkills}>
                Add skill
              </Button>
            </div>
            <p className="tu-field-help">
              Press Enter or Add skill. Up to 12 skills, 50 characters each.
            </p>
            {issue('requiredSkills')}
            <ul className="tu-selected-skills" aria-label="Selected skills">
              {draft.requiredSkills.map((skill) => (
                <li key={skill.toLowerCase()}>
                  <span>{skill}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${skill}`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        requiredSkills: draft.requiredSkills.filter((value) => value !== skill),
                      })
                    }
                  >
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ul>
            <span className="tu-field-help" role="status">
              {draft.requiredSkills.length} of 12 skills selected
            </span>
          </div>
          <label className="cc-label" htmlFor="tu-form-maxMembers">
            <span className="tu-label-line">
              Maximum team size <small className="tu-required">Required</small>
            </span>
            <input
              {...field('maxMembers')}
              className="cc-field"
              required
              type="number"
              min={minimum}
              max={20}
              step={1}
              value={Number.isNaN(draft.maxMembers) ? '' : draft.maxMembers}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  maxMembers: event.target.value === '' ? NaN : Number(event.target.value),
                })
              }
            />
            <span className="tu-field-help">
              Includes you, the owner.{' '}
              {project
                ? `The team currently has ${project.currentMemberCount} ${project.currentMemberCount === 1 ? 'member' : 'members'}.`
                : 'Choose 2–20 people in total.'}
            </span>
            {issue('maxMembers')}
          </label>
        </div>
      </fieldset>
      <fieldset disabled={saving}>
        <legend>
          <span>03</span> Timeline & visibility
        </legend>
        <label className="cc-label tu-date-field" htmlFor="tu-form-deadline">
          <span className="tu-label-line">
            Application deadline <small className="tu-optional">Optional</small>
          </span>
          <input
            {...field('deadline')}
            className="cc-field"
            type="date"
            value={draft.deadline}
            onChange={(event) => setDraft({ ...draft, deadline: event.target.value })}
          />
          <span className="tu-field-help">
            Leave blank if no deadline is set. Dates are saved without a time.
          </span>
          {issue('deadline')}
        </label>
        <TeamUpFeaturedConsent
          disabled={saving}
          eligible={!project || project.status === 'OPEN'}
          value={draft.featuredOnLanding}
          onChange={(featuredOnLanding) => setDraft({ ...draft, featuredOnLanding })}
        />
      </fieldset>
      <footer className="tu-form-actions">
        <Link
          className={`cc-button cc-button--secondary${saving ? ' tu-disabled-link' : ''}`}
          aria-disabled={saving}
          tabIndex={saving ? -1 : undefined}
          onClick={(event) => {
            if (saving) event.preventDefault();
          }}
          to={project ? `/teamup/${project.id}` : '/teamup'}
        >
          Cancel
        </Link>
        <Button disabled={saving || (!!project && !hasChanges)} type="submit">
          {saving ? 'Saving project…' : project ? 'Save changes' : 'Create project'}
        </Button>
      </footer>
    </form>
  );
}
