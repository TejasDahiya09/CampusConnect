import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Skeleton } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ApiClientError } from '../../services/api-client';
import { useAuth } from '../auth/useAuth';
import { messagingService } from '../messaging/messaging-service';
import { ReportAction } from '../moderation/ReportAction';
import { ShareActions } from '../share/ShareActions';
import { StudentAvatar } from '../students/StudentAvatar';
import { StudentRecommendationCards } from '../students/RecommendationCards';
import { studentsApi } from '../students/students-service';
import type { StudentRecommendation } from '../students/students.types';
import { teamUpApi } from './teamup-service';
import { teamUpCapacity, teamUpDeadline, teamUpLabel } from './teamup-discovery';
import { projectParticipation, refreshProjectReview } from './teamup-detail-state';
import type { TeamUpApplication, TeamUpPerson, TeamUpProject, TeamUpStatus } from './teamup.types';
import './teamup-detail.css';

const errorText = (reason: unknown) =>
  reason instanceof ApiClientError
    ? reason.message
    : 'The request could not be completed. Please try again.';

export function TeamUpDetailPage() {
  const { id = '' } = useParams();
  // A route-local instance prevents late mutation responses leaking into another project.
  return <ProjectDetail key={id} id={id} />;
}

const subscribeLayout = (changed: () => void) => {
  const media = window.matchMedia('(max-width: 767px)');
  media.addEventListener('change', changed);
  return () => media.removeEventListener('change', changed);
};
const isMobileLayout = () => window.matchMedia('(max-width: 767px)').matches;
const serverLayout = () => false;

function ProjectDetail({ id }: { readonly id: string }) {
  const mobileLayout = useSyncExternalStore(subscribeLayout, isMobileLayout, serverLayout);
  const { applicationUser, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<TeamUpProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [applications, setApplications] = useState<readonly TeamUpApplication[] | null>(null);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [recommendedStudents, setRecommendedStudents] = useState<
    readonly StudentRecommendation[] | null
  >(null);
  const [recommendationState, setRecommendationState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    teamUpApi
      .getProject(id)
      .then((value) => {
        if (current) {
          setProject(value);
          setLoadError(null);
        }
      })
      .catch((reason: unknown) => {
        if (current) setLoadError(errorText(reason));
      });
    return () => {
      current = false;
    };
  }, [id, attempt]);
  useEffect(() => {
    if (!project?.viewerIsOwner) return;
    let current = true;
    teamUpApi
      .getApplications(id)
      .then((items) => {
        if (current) setApplications(items);
      })
      .catch((reason: unknown) => {
        if (current) setApplicationsError(errorText(reason));
      });
    return () => {
      current = false;
    };
  }, [id, project?.viewerIsOwner]);

  const run = async (key: string, action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(key);
    setFeedback(null);
    try {
      await action();
    } catch (reason) {
      if (alive.current) setFeedback({ error: true, text: errorText(reason) });
    } finally {
      lock.current = false;
      if (alive.current) setBusy(null);
    }
  };
  const refresh = async () => {
    if (!project) return;
    if (project.viewerIsOwner) {
      const result = await refreshProjectReview(teamUpApi, id);
      if (alive.current) {
        setProject(result.project);
        setApplications(result.applications);
        setApplicationsError(null);
        setNeedsRefresh(false);
      }
    } else {
      const result = await teamUpApi.getProject(id);
      if (alive.current) {
        setProject(result);
        setNeedsRefresh(false);
      }
    }
  };
  const review = (application: TeamUpApplication, status: 'ACCEPTED' | 'REJECTED') =>
    run(application.id, async () => {
      await teamUpApi.reviewApplication(id, application.id, status);
      if (!alive.current) return;
      setNeedsRefresh(true);
      try {
        await refresh();
        if (alive.current)
          setFeedback({
            error: false,
            text: 'Application reviewed. The project and roster are up to date.',
          });
      } catch {
        if (alive.current)
          setFeedback({
            error: true,
            text: 'The decision was saved, but updated project information could not be loaded. Refresh project information before reviewing again.',
          });
      }
    });
  const transition = (status: TeamUpStatus) =>
    run('lifecycle', async () => {
      const result = await teamUpApi.transition(id, status);
      if (!alive.current) return;
      setProject((previous) =>
        previous ? { ...previous, ...result, members: previous.members } : result,
      );
      setFeedback({ error: false, text: 'Project status updated.' });
    });
  const message = (person: TeamUpPerson) =>
    run(`message-${person.id}`, async () => {
      const conversation = await messagingService.open({
        contextId: id,
        contextType: 'TEAMUP',
        targetUserId: person.id,
      });
      if (alive.current) void navigate(`/messages/${conversation.id}`);
    });
  const apply = (event: FormEvent) => {
    event.preventDefault();
    if (
      !project ||
      projectParticipation(project).state !== 'eligible' ||
      !isAuthenticated ||
      needsRefresh
    )
      return;
    void run('apply', async () => {
      const application = await teamUpApi.apply(id, note);
      if (alive.current) {
        setProject((previous) =>
          previous ? { ...previous, viewerApplicationStatus: application.status } : previous,
        );
        setNote('');
        setFeedback({ error: false, text: 'Application submitted.' });
      }
    });
  };
  const findSuitableStudents = () => {
    if (recommendationState === 'loading') return;
    setRecommendationState('loading');
    void studentsApi
      .recommendedStudents(id)
      .then((items) => {
        if (alive.current) {
          setRecommendedStudents(items);
          setRecommendationState('success');
        }
      })
      .catch(() => {
        if (alive.current) setRecommendationState('error');
      });
  };
  const back = (
    <Link className="tu-detail-back" to="/teamup">
      <Icon name="arrow" /> Back to TeamUp
    </Link>
  );
  if (loadError)
    return (
      <div className="cc-page tu-detail">
        {back}
        <section className="tu-detail-unavailable" role="alert">
          <Icon name="warning" />
          <h1>Project unavailable</h1>
          <p>{loadError}</p>
          <Button
            onClick={() => {
              setLoadError(null);
              setAttempt((value) => value + 1);
            }}
          >
            Retry project
          </Button>
        </section>
      </div>
    );
  if (!project)
    return (
      <div className="cc-page tu-detail" aria-busy="true">
        {back}
        <p role="status" className="sr-only">
          Loading project
        </p>
        <div className="tu-detail-loading">
          <Skeleton className="tu-detail-skeleton" />
          <Skeleton className="tu-detail-skeleton" />
        </div>
      </div>
    );
  const participation = projectParticipation(project);
  const roster = [
    project.owner,
    ...(project.members ?? []).filter((member) => member.id !== project.ownerId),
  ];
  const canMessage = (person: TeamUpPerson) =>
    isAuthenticated &&
    (project.viewerIsOwner || project.viewerIsMember) &&
    applicationUser?.id !== person.id;
  const ownerIdentity = (
    <div className="tu-detail-person">
      <StudentAvatar avatar={project.owner.avatar} displayName={project.owner.displayName} />
      <div>
        <strong>{project.owner.displayName}</strong>
        <Link to={`/profile/${project.ownerId}`}>
          View profile <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
  const identity = (
    <header className="tu-detail-identity">
      <div className="tu-detail-kickers">
        {project.category ? <span>{project.category}</span> : null}
        <span className="tu-detail-status" data-status={project.status}>
          {teamUpLabel(project.status)}
        </span>
      </div>
      <h1>{project.title}</h1>
      {project.description.length > 480 ? (
        <details className="tu-detail-overview">
          <summary>
            <span className="tu-detail-excerpt">{project.description.slice(0, 300)}…</span>
            <span className="tu-detail-overview-open">Read full project overview</span>
            <span className="tu-detail-overview-close">Collapse project overview</span>
          </summary>
          <p className="tu-detail-description">{project.description}</p>
        </details>
      ) : (
        <p className="tu-detail-description">
          {project.description || 'No project description has been provided.'}
        </p>
      )}
      <div className="tu-detail-capacity">
        <span>
          <Icon name="team" />
          {project.currentMemberCount} of {project.maxMembers} members{' '}
          <small>(including the owner)</small>
        </span>
        <strong>{teamUpCapacity(project)}</strong>
      </div>
    </header>
  );
  const skills = (
    <section className="tu-detail-skills" aria-labelledby="tu-detail-skills-title">
      <h2 id="tu-detail-skills-title">Skills to bring</h2>
      {project.requiredSkills.length ? (
        <ul>
          {project.requiredSkills.map((skill, index) => (
            <li key={`${skill}-${index}`}>{skill}</li>
          ))}
        </ul>
      ) : (
        <p>No specific skills required.</p>
      )}
    </section>
  );
  const participationPanel = (
    <section
      className="tu-detail-participation tu-detail-panel"
      data-state={participation.state}
      aria-labelledby="tu-participation-title"
      aria-busy={busy === 'apply'}
    >
      <div className="tu-detail-participation-heading">
        <span className="tu-detail-state-mark" aria-hidden="true">
          <Icon
            name={
              participation.state === 'pending'
                ? 'inbox'
                : ['member', 'accepted'].includes(participation.state)
                  ? 'check'
                  : 'team'
            }
          />
        </span>
        <div>
          <span className="tu-detail-eyebrow">Your next step</span>
          <h2 id="tu-participation-title">{participation.title}</h2>
        </div>
      </div>
      <p role="status">{participation.description}</p>
      {participation.state === 'eligible' && isAuthenticated ? (
        <form onSubmit={apply}>
          <label className="cc-label" htmlFor="tu-application-note">
            Application note (optional)
          </label>
          <textarea
            id="tu-application-note"
            className="cc-field"
            maxLength={1000}
            rows={3}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              const field = event.currentTarget;
              field.style.height = '0px';
              field.style.height = `${Math.max(88, field.scrollHeight + 2)}px`;
            }}
            disabled={!!busy || needsRefresh}
          />
          <Button type="submit" disabled={!!busy || needsRefresh}>
            {busy === 'apply' ? 'Submitting application…' : 'Apply to join'}
          </Button>
        </form>
      ) : null}
      {!isAuthenticated ? <p>Sign in to participate.</p> : null}
      {project.viewerIsOwner ? (
        <div className="tu-detail-owner-controls">
          {['OPEN', 'FULL'].includes(project.status) ? (
            <Link className="cc-button cc-button--secondary" to={`/teamup/${id}/edit`}>
              Edit project
            </Link>
          ) : null}
          {['OPEN', 'FULL'].includes(project.status) ? (
            <Button disabled={!!busy || needsRefresh} onClick={() => void transition('COMPLETED')}>
              Mark completed
            </Button>
          ) : null}
          {project.status !== 'ARCHIVED' ? (
            <Button
              variant="secondary"
              disabled={!!busy || needsRefresh}
              onClick={() => void transition('ARCHIVED')}
            >
              {busy === 'lifecycle' ? 'Updating project…' : 'Archive project'}
            </Button>
          ) : null}
        </div>
      ) : null}
      {feedback ? (
        <p
          className="tu-detail-feedback"
          role={feedback.error ? 'alert' : 'status'}
          data-error={feedback.error}
        >
          {feedback.text}
        </p>
      ) : null}
      {needsRefresh || participation.state === 'accepted' ? (
        <Button variant="secondary" disabled={!!busy} onClick={() => void run('refresh', refresh)}>
          Refresh project information
        </Button>
      ) : null}
    </section>
  );
  const team = (
    <section className="tu-detail-team" aria-labelledby="tu-detail-team-title">
      <div className="tu-detail-section-heading">
        <h2 id="tu-detail-team-title">The team</h2>
        <span>
          {project.currentMemberCount}/{project.maxMembers} members
        </span>
      </div>
      <ul className="tu-detail-roster">
        {roster.map((person) => (
          <li key={person.id}>
            <StudentAvatar avatar={person.avatar} displayName={person.displayName} />
            <div>
              <strong>{person.displayName}</strong>
              <span>
                {person.id === project.ownerId ? 'Project owner' : 'Team member'}
                {person.department ? ` · ${person.department}` : ''}
              </span>
            </div>
            {canMessage(person) ? (
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() => void message(person)}
                aria-label={`Message ${person.displayName}`}
              >
                {busy === `message-${person.id}` ? 'Opening…' : 'Message'}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {project.currentMemberCount > roster.length ? (
        <p className="tu-detail-muted">Additional member profiles are unavailable.</p>
      ) : null}
    </section>
  );
  const facts = (
    <section className="tu-detail-facts" aria-labelledby="tu-detail-facts-title">
      <h2 id="tu-detail-facts-title">Project information</h2>
      <dl>
        <div>
          <dt>Application deadline</dt>
          <dd>{teamUpDeadline(project.deadline)}</dd>
        </div>
        <div>
          <dt>Project status</dt>
          <dd>{teamUpLabel(project.status)}</dd>
        </div>
      </dl>
    </section>
  );
  const owner = (
    <section
      className={`tu-detail-owner${mobileLayout ? ' tu-detail-owner-compact' : ' tu-detail-panel'}`}
      aria-labelledby="tu-detail-owner-title"
    >
      <h2 id="tu-detail-owner-title">Project lead</h2>
      {mobileLayout ? (
        <Link
          className="tu-detail-lead-profile"
          to={`/profile/${project.ownerId}`}
          aria-label={`View ${project.owner.displayName}'s profile`}
        >
          View profile <span aria-hidden="true">→</span>
        </Link>
      ) : (
        ownerIdentity
      )}
      {canMessage(project.owner) ? (
        <Button variant="secondary" disabled={!!busy} onClick={() => void message(project.owner)}>
          Message project owner
        </Button>
      ) : null}
    </section>
  );
  const secondary = (
    <section className="tu-detail-secondary" aria-label="Project actions">
      <div className="tu-detail-action-row">
        <Button
          className="tu-detail-share-trigger"
          variant="secondary"
          aria-expanded={shareOpen}
          aria-controls="tu-project-share"
          onClick={() => setShareOpen((open) => !open)}
        >
          <Icon name="share" /> Share project
        </Button>
        {!project.viewerIsOwner && isAuthenticated ? (
          <ReportAction targetId={project.id} targetType="TEAMUP" />
        ) : null}
      </div>
      <div id="tu-project-share" hidden={!shareOpen}>
        <ShareActions
          className="tu-detail-share"
          record={{
            category: project.category,
            description: project.description,
            id: project.id,
            module: 'TEAMUP',
            skills: project.requiredSkills,
            status: project.status,
            title: project.title,
          }}
        />
      </div>
    </section>
  );
  return (
    <div className="cc-page tu-detail">
      {back}
      <div className="tu-detail-workspace">
        {mobileLayout ? (
          <>
            <div className="tu-detail-overview-group">
              {identity}
              {skills}
            </div>
            {participationPanel}
            {team}
            {facts}
            {owner}
            {secondary}
          </>
        ) : (
          <>
            <div className="tu-detail-main">
              {identity}
              {skills}
              {team}
              {facts}
            </div>
            <aside className="tu-detail-rail" aria-label="Participation and project actions">
              {participationPanel}
              {owner}
              {secondary}
            </aside>
          </>
        )}
        {project.viewerIsOwner ? (
          <section className="tu-detail-applications" aria-labelledby="tu-applications-title">
            <header className="tu-detail-owner-heading">
              <span className="tu-detail-eyebrow">Owner workspace</span>
              <h2 id="tu-applications-title">Applications</h2>
            </header>
            {applicationsError ? (
              <div role="alert">
                <p>{applicationsError}</p>
                <Button disabled={!!busy} onClick={() => void run('refresh', refresh)}>
                  Retry applications
                </Button>
              </div>
            ) : applications === null ? (
              <p role="status">Loading applications…</p>
            ) : !applications.length ? (
              <p>No applications yet.</p>
            ) : (
              <ul>
                {applications.map((application) => (
                  <li key={application.id}>
                    <div className="tu-detail-person">
                      <StudentAvatar
                        avatar={application.applicant.avatar}
                        displayName={application.applicant.displayName}
                      />
                      <div>
                        <strong>{application.applicant.displayName}</strong>
                        <span>{application.applicant.department || 'Department not shared'}</span>
                      </div>
                      <span className="tu-detail-status" data-status={application.status}>
                        {application.status.toLowerCase()}
                      </span>
                    </div>
                    <p className="tu-detail-application-date">
                      Submitted{' '}
                      {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                        new Date(application.createdAt),
                      )}
                    </p>
                    {application.message ? (
                      <p className="tu-detail-note">{application.message}</p>
                    ) : null}
                    {application.status === 'PENDING' ? (
                      <div className="tu-detail-review-actions">
                        <Button
                          disabled={
                            !!busy ||
                            needsRefresh ||
                            project.status !== 'OPEN' ||
                            project.currentMemberCount >= project.maxMembers
                          }
                          onClick={() => void review(application, 'ACCEPTED')}
                        >
                          {busy === application.id ? 'Saving decision…' : 'Accept application'}
                        </Button>
                        <Button
                          disabled={!!busy || needsRefresh}
                          variant="secondary"
                          onClick={() => void review(application, 'REJECTED')}
                        >
                          Reject application
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
        {project.viewerIsOwner ? (
          <section className="tu-detail-suggestions" aria-labelledby="recommended-students-title">
            <h2 id="recommended-students-title">Find suitable students</h2>
            <p>Rank eligible collaborators using public profile skills and interests.</p>
            <Button disabled={recommendationState === 'loading'} onClick={findSuitableStudents}>
              {recommendationState === 'loading'
                ? 'Finding students…'
                : recommendationState === 'success'
                  ? 'Refresh recommendations'
                  : recommendationState === 'error'
                    ? 'Retry recommendations'
                    : 'Find Suitable Students'}
            </Button>
            {recommendationState === 'loading' ? (
              <p role="status">Finding suitable students…</p>
            ) : recommendationState === 'error' ? (
              <p role="alert">
                Recommendations are temporarily unavailable. Your project is unaffected.
              </p>
            ) : recommendedStudents ? (
              <StudentRecommendationCards recommendations={recommendedStudents} />
            ) : (
              <p>Recommendations are loaded only when you request them.</p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
