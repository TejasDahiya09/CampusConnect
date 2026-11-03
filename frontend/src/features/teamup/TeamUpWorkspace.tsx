import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Skeleton } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ApiClientError } from '../../services/api-client';
import { StudentAvatar } from '../students/StudentAvatar';
import { teamUpApi } from './teamup-service';
import { refreshProjectReview } from './teamup-detail-state';
import { teamUpDeadline, teamUpLabel } from './teamup-discovery';
import type { TeamUpApplication, TeamUpProject, TeamUpWorkspace } from './teamup.types';
import './teamup-management.css';
const errorMessage = (reason: unknown) =>
  reason instanceof ApiClientError
    ? reason.message
    : 'Project information could not be loaded. Please try again.';
const sections = [
  { key: 'owned', label: 'Projects I own' },
  { key: 'joined', label: 'Projects I joined' },
  { key: 'applications', label: 'My applications' },
] as const;
type Section = (typeof sections)[number]['key'];
export function MyProjectsPage() {
  const [data, setData] = useState<TeamUpWorkspace | null>(null),
    [error, setError] = useState<string | null>(null),
    [section, setSection] = useState<Section>('owned'),
    [selected, setSelected] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const reload = useCallback(async () => {
    const result = await teamUpApi.getWorkspace();
    if (alive.current) {
      setData(result);
      setError(null);
    }
  }, []);
  useEffect(() => {
    let current = true;
    teamUpApi
      .getWorkspace()
      .then((result) => {
        if (current) {
          setData(result);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (current) setError(errorMessage(reason));
      });
    return () => {
      current = false;
    };
  }, [attempt]);
  const switchSection = (value: Section) => {
    setSection(value);
    setSelected(null);
  };
  return (
    <div className="cc-page tu-manage tu-workspace">
      <Link className="tu-manage-back" to="/teamup">
        <Icon name="arrow" /> Back to TeamUp
      </Link>
      <header className="tu-manage-header">
        <div>
          <span className="tu-manage-eyebrow">Your collaborations</span>
          <h1>My Projects</h1>
          <p>Your ideas, your teams, and every application in one place.</p>
        </div>
        <Link className="cc-button cc-button--primary" to="/teamup/new">
          <Icon name="plus" /> Create project
        </Link>
      </header>
      {error ? (
        <section className="tu-manage-state" role="alert">
          <h2>Workspace unavailable</h2>
          <p>{error}</p>
          <Button
            onClick={() => {
              setError(null);
              setAttempt((value) => value + 1);
            }}
          >
            Retry workspace
          </Button>
        </section>
      ) : !data ? (
        <section aria-busy="true">
          <p role="status">Loading your projects…</p>
          <Skeleton className="tu-editor-skeleton" />
        </section>
      ) : (
        <>
          <div className="tu-workspace-tabs" role="tablist" aria-label="Project relationships">
            {sections.map(({ key, label }, index) => (
              <button
                type="button"
                key={key}
                id={`tu-tab-${key}`}
                role="tab"
                aria-selected={section === key}
                aria-controls="tu-workspace-panel"
                tabIndex={section === key ? 0 : -1}
                onClick={(event) => {
                  switchSection(key);
                  event.currentTarget.scrollIntoView({
                    block: 'nearest',
                    inline: 'nearest',
                    behavior: 'instant',
                  });
                }}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? 2
                        : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                  const target = sections[next];
                  if (target) {
                    switchSection(target.key);
                    const button = document.getElementById(`tu-tab-${target.key}`);
                    button?.focus();
                    button?.scrollIntoView({
                      block: 'nearest',
                      inline: 'nearest',
                      behavior: 'instant',
                    });
                  }
                }}
              >
                {label}
                <span>{data[key].length}</span>
              </button>
            ))}
          </div>
          <section
            id="tu-workspace-panel"
            role="tabpanel"
            aria-labelledby={`tu-tab-${section}`}
            tabIndex={0}
          >
            <div className="tu-workspace-heading">
              <h2>{sections.find((item) => item.key === section)?.label}</h2>
              <p>
                {section === 'owned'
                  ? 'Shape your project and review students who want to contribute.'
                  : section === 'joined'
                    ? 'Pick up where you left off with your teams.'
                    : 'Follow the decisions on your submitted applications.'}
              </p>
            </div>
            {!data[section].length ? (
              <div className="tu-manage-state">
                <Icon name="team" />
                <h3>
                  {section === 'owned'
                    ? 'Your next idea starts here'
                    : section === 'joined'
                      ? 'No joined projects yet'
                      : 'No applications yet'}
                </h3>
                <p>
                  {section === 'owned'
                    ? 'Create a project to bring the right people together.'
                    : section === 'joined'
                      ? 'Accepted team memberships will appear here.'
                      : 'Explore open projects and apply when you find a good fit.'}
                </p>
                <Link
                  className="cc-button cc-button--secondary"
                  to={section === 'owned' ? '/teamup/new' : '/teamup'}
                >
                  {section === 'owned' ? 'Create a project' : 'Discover projects'}
                </Link>
              </div>
            ) : (
              <div className="tu-workspace-grid">
                {section === 'applications'
                  ? data.applications.map((application) => (
                      <article className="tu-workspace-card" key={application.id}>
                        <div className="tu-workspace-card-top">
                          <span>Your application</span>
                          <span className="tu-management-status" data-status={application.status}>
                            {application.status.toLowerCase()}
                          </span>
                        </div>
                        <h3>{application.project?.title ?? 'Project information unavailable'}</h3>
                        {application.project ? (
                          <>
                            <p>{application.project.category || 'Student project'}</p>
                            <div className="tu-workspace-meta">
                              <span>
                                {application.project.currentMemberCount}/
                                {application.project.maxMembers} members
                              </span>
                              <span>{teamUpLabel(application.project.status)}</span>
                            </div>
                            <Link
                              className="cc-button cc-button--secondary"
                              to={`/teamup/${application.project.id}`}
                            >
                              View project
                            </Link>
                          </>
                        ) : (
                          <p>This application has no accessible project destination.</p>
                        )}
                      </article>
                    ))
                  : data[section].map((project) => (
                      <article className="tu-workspace-card" key={project.id}>
                        <div className="tu-workspace-card-top">
                          <span>{project.category || 'Student project'}</span>
                          <span className="tu-management-status" data-status={project.status}>
                            {teamUpLabel(project.status)}
                          </span>
                        </div>
                        <h3>{project.title}</h3>
                        <p>{section === 'owned' ? 'Project owner' : 'Team member'}</p>
                        <div className="tu-workspace-meta">
                          <span>
                            <Icon name="team" />
                            {project.currentMemberCount}/{project.maxMembers} members
                          </span>
                          <span>
                            <Icon name="calendar" />
                            {teamUpDeadline(project.deadline)}
                          </span>
                        </div>
                        <div
                          className={`tu-workspace-card-actions${section === 'owned' ? ' tu-owned-actions' : ''}`}
                        >
                          <Link
                            className={`cc-button cc-button--${section === 'owned' ? 'primary' : 'secondary'}`}
                            to={`/teamup/${project.id}`}
                          >
                            {section === 'owned' ? 'Manage project' : 'View project'}
                          </Link>
                          {section === 'owned' && project.viewerIsOwner ? (
                            <>
                              <Button
                                variant="secondary"
                                aria-expanded={selected === project.id}
                                aria-controls="tu-owner-review"
                                onClick={() =>
                                  setSelected((value) => (value === project.id ? null : project.id))
                                }
                              >
                                Review applications
                              </Button>
                              {['OPEN', 'FULL'].includes(project.status) ? (
                                <Link
                                  className="tu-manage-text-link"
                                  to={`/teamup/${project.id}/edit`}
                                >
                                  Edit
                                </Link>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </article>
                    ))}
              </div>
            )}
          </section>
          {section === 'owned' && selected ? (
            <OwnerReview key={selected} id={selected} onUpdated={reload} />
          ) : null}
        </>
      )}
    </div>
  );
}
function OwnerReview({
  id,
  onUpdated,
}: {
  readonly id: string;
  readonly onUpdated: () => Promise<void>;
}) {
  const [data, setData] = useState<{
      project: TeamUpProject;
      applications: readonly TeamUpApplication[];
    } | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [feedback, setFeedback] = useState(''),
    [attempt, setAttempt] = useState(0);
  const lock = useRef(false),
    alive = useRef(true),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    void teamUpApi
      .getProject(id)
      .then(async (project) => {
        if (!project.viewerIsOwner)
          throw new Error('Only the project owner may review applications.');
        const applications = await teamUpApi.getApplications(id);
        if (current) {
          setData({ project, applications });
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
  const recover = async () => {
    const result = await refreshProjectReview(teamUpApi, id);
    if (!result.project.viewerIsOwner) throw new Error('Project ownership is no longer available.');
    await onUpdated();
    if (alive.current) {
      setData(result);
      setSaved(false);
      setError(null);
      setFeedback('Application and team information are up to date.');
    }
  };
  const review = async (application: TeamUpApplication, status: 'ACCEPTED' | 'REJECTED') => {
    if (lock.current || saved) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setFeedback('Saving application decision…');
    try {
      await teamUpApi.reviewApplication(id, application.id, status);
      if (!alive.current) return;
      setSaved(true);
      try {
        await recover();
      } catch {
        if (alive.current) {
          setError(
            'The decision was saved, but refreshed information could not be loaded. Refresh information before reviewing again.',
          );
          setFeedback('');
        }
      }
    } catch (reason) {
      if (alive.current) {
        setError(errorMessage(reason));
        setFeedback('');
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section
      className="tu-owner-review"
      id="tu-owner-review"
      aria-labelledby="tu-review-title"
      aria-busy={busy}
    >
      <header>
        <span className="tu-manage-eyebrow">Owner workspace</span>
        <h2 id="tu-review-title" ref={heading} tabIndex={-1}>
          Applications{data ? ` · ${data.project.title}` : ''}
        </h2>
        <p>Review each student’s note. Team membership changes only after a confirmed decision.</p>
      </header>
      {error ? (
        <div className="tu-form-errors" role="alert">
          <p>{error}</p>
          {saved ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                void recover()
                  .catch((reason: unknown) => {
                    if (alive.current) setError(errorMessage(reason));
                  })
                  .finally(() => {
                    lock.current = false;
                    if (alive.current) setBusy(false);
                  });
              }}
            >
              Refresh information
            </Button>
          ) : !data ? (
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}
            >
              Retry applications
            </Button>
          ) : null}
        </div>
      ) : null}
      {feedback ? (
        <p role="status" className="tu-review-feedback">
          {feedback}
        </p>
      ) : null}
      {!data && !error ? (
        <p role="status">Loading applications…</p>
      ) : data ? (
        !data.applications.length ? (
          <p className="tu-manage-state">No applications yet. New applications will appear here.</p>
        ) : (
          <ul className="tu-review-list">
            {data.applications.map((application) => (
              <li key={application.id}>
                <div className="tu-review-person">
                  <StudentAvatar
                    avatar={application.applicant.avatar}
                    displayName={application.applicant.displayName}
                  />
                  <div>
                    <strong>{application.applicant.displayName}</strong>
                    <span>{application.applicant.department || 'Department not shared'}</span>
                  </div>
                  <span className="tu-management-status" data-status={application.status}>
                    {application.status.toLowerCase()}
                  </span>
                </div>
                <p className="tu-field-help">
                  Submitted{' '}
                  {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                    new Date(application.createdAt),
                  )}
                </p>
                {application.message ? (
                  <p className="tu-review-note">{application.message}</p>
                ) : null}
                {application.status === 'PENDING' ? (
                  <div className="tu-review-actions">
                    <Button
                      disabled={
                        busy ||
                        saved ||
                        data.project.status !== 'OPEN' ||
                        data.project.currentMemberCount >= data.project.maxMembers
                      }
                      onClick={() => void review(application, 'ACCEPTED')}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy || saved}
                      onClick={() => void review(application, 'REJECTED')}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
      <Link className="tu-manage-text-link" to={`/teamup/${id}`}>
        Open project and team workspace <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
