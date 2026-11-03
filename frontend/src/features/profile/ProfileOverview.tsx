import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfessionalProfileCard } from './ProfessionalProfileCard';
import type { ProfessionalDetails } from './professional-profile';
import { ProfileCompletion } from './ProfileCompletion';
import {
  profileInitials,
  profilePortfolio,
  safePortfolioHref,
  portfolioLinkPresentation,
  profileDate,
} from './profile-overview';
import { ProfileCoverArt } from './ProfileCoverArt';
import { useProfileAffix } from './useProfileAffix';
import type { StudentProfile } from './profile.types';
interface OverviewProps {
  readonly onPhoto?: () => void;
  readonly profile: StudentProfile;
  readonly professional?: ProfessionalDetails | null;
  readonly professionalAvailable?: boolean;
  readonly professionalLoading?: boolean;
  readonly professionalError?: string | null;
  readonly onProfessionalRetry?: () => void;
  readonly onEdit: (section?: string) => void;
  readonly onRefresh?: () => void;
  readonly refreshDisabled?: boolean;
}
export function ProfileOverview({
  profile,
  onPhoto,
  onEdit,
  professional = null,
  professionalAvailable = false,
  professionalLoading = false,
  professionalError = null,
  onProfessionalRetry,
  onRefresh,
  refreshDisabled = false,
}: OverviewProps) {
  const { workspace: workspaceRef, rail: railRef, completion: completionRef } = useProfileAffix();
  const { linkedIn, remaining } = profilePortfolio(profile.portfolioLinks);
  const edit = (section: string, label: string) => (
    <button
      className="sp-text-action sp-section-edit"
      type="button"
      onClick={() => onEdit(section)}
    >
      {label}
      <Icon name="arrow" />
    </button>
  );
  return (
    <div className="sp-workspace" ref={workspaceRef}>
      <header className="sp-identity">
        <div className="sp-identity-cover">
          <div className="sp-cover-label">
            <span>CampusConnect</span>
            <p>Student portfolio</p>
          </div>
          <ProfileCoverArt />
          {onRefresh && (
            <button
              className="sp-refresh"
              type="button"
              onClick={onRefresh}
              disabled={refreshDisabled}
              aria-label="Refresh profile"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d="M20 7v5h-5M4 17v-5h5M19 12a7 7 0 0 0-12-5L4 10m16 4-3 3a7 7 0 0 1-12-5" />
              </svg>
              <span>Refresh profile</span>
            </button>
          )}
        </div>
        <div className="sp-identity-body">
          {onPhoto ? (
            <button
              type="button"
              aria-label="Change profile photo"
              title="Change profile photo"
              className="sp-photo-trigger rounded-3xl shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4"
              onClick={onPhoto}
            >
              <ProfileAvatar
                avatar={profile.avatar}
                fallback={profileInitials(profile.displayName)}
              />
            </button>
          ) : (
            <ProfileAvatar
              avatar={profile.avatar}
              fallback={profileInitials(profile.displayName)}
            />
          )}
          <div className="sp-identity-copy">
            <h1 tabIndex={-1} id="profile-overview-heading">
              {profile.displayName}
            </h1>
            <div className="sp-identity-meta">
              {profile.department?.name && <span>{profile.department.name}</span>}
              {profile.year !== null && <span>Year {profile.year}</span>}
              {profile.location && <span>{profile.location}</span>}
            </div>
          </div>
          <div className="sp-identity-actions">
            <button type="button" className="cc-button cc-button--primary" onClick={() => onEdit()}>
              <Icon name="profile" />
              Edit profile
            </button>
            <Link className="cc-button cc-button--secondary" to={`/profile/${profile.userId}`}>
              Public view
              <Icon name="arrow" />
            </Link>
          </div>
        </div>
      </header>
      <aside className="sp-sidebar" aria-label="Professional profile" ref={railRef}>
        <ProfessionalProfileCard
          profile={profile}
          details={professional}
          storageAvailable={professionalAvailable}
          loading={professionalLoading}
          loadError={professionalError}
          onRetry={onProfessionalRetry}
          onEdit={() => onEdit('professional')}
          onEditLink={() => onEdit('portfolio')}
        />
      </aside>
      <div className="sp-main">
        <div className="sp-content sp-portfolio-canvas">
          <div className="sp-story-panel">
            <section className="sp-intro" aria-labelledby="sp-about">
              <div className="sp-section-heading">
                <div>
                  <h2 id="sp-about">About me</h2>
                </div>
                {edit('identity', profile.bio?.trim() ? 'Edit introduction' : 'Add introduction')}
              </div>
              <p className={profile.bio?.trim() ? 'sp-bio' : 'sp-empty'}>
                {profile.bio?.trim()
                  ? profile.bio
                  : 'Tell your campus what you are learning, building or exploring.'}
              </p>
            </section>
            <section className="sp-expertise" aria-labelledby="sp-skills">
              <div className="sp-section-heading">
                <div>
                  <h2 id="sp-skills">Skills &amp; expertise</h2>
                </div>
                {edit('skills', 'Edit skills')}
              </div>
              {profile.skills.length ? (
                <ul className="sp-chips">
                  {profile.skills.map((s) => (
                    <li className="sp-skill" key={s.id}>
                      <span>{s.name}</span>
                      {s.proficiency !== null && (
                        <span className="sp-level">Level {s.proficiency}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sp-empty">No skills added yet. Start with what you know.</p>
              )}
            </section>
          </div>
          <section className="sp-achievement-section" aria-labelledby="sp-achievements">
            <div className="sp-section-heading">
              <div>
                <h2 id="sp-achievements">Achievements</h2>
              </div>
              {edit(
                'achievements',
                profile.achievements.length ? 'Edit achievements' : 'Add achievement',
              )}
            </div>
            {profile.achievements.length ? (
              <div
                className={`sp-achievements${profile.achievements.length > 1 ? ' has-timeline' : ''}`}
              >
                {profile.achievements.map((item) => (
                  <article key={item.id}>
                    <div className="sp-achievement-heading">
                      <h3>{item.title}</h3>
                      {item.awardedAt && (
                        <time dateTime={item.awardedAt}>{profileDate(item.awardedAt)}</time>
                      )}
                    </div>
                    {item.description && <p>{item.description}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <p className="sp-empty">
                No achievements added yet. Keep a record of meaningful work.
              </p>
            )}
          </section>
          <div className="sp-connections">
            <section className="sp-interests-section" aria-labelledby="sp-interests">
              <div className="sp-section-heading">
                <h2 id="sp-interests">Interests</h2>
                {edit('interests', 'Edit interests')}
              </div>
              {profile.interests.length ? (
                <ul className="sp-chips">
                  {profile.interests.map((item) => (
                    <li className="sp-interest" key={item.id}>
                      {item.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sp-empty">
                  No interests added yet. Share what sparks your curiosity.
                </p>
              )}
            </section>
            <section className="sp-portfolio-section" aria-labelledby="sp-links">
              <div className="sp-section-heading">
                <h2 id="sp-links">Portfolio &amp; professional links</h2>
                {edit('portfolio', 'Manage links')}
              </div>
              {remaining.length ? (
                <ul className="sp-links">
                  {remaining.map((link) => {
                    const href = safePortfolioHref(link.url);
                    const presentation = portfolioLinkPresentation(link.url);
                    return (
                      <li key={link.id}>
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${link.label} (opens in a new tab)`}
                          >
                            <Icon name={presentation.icon} />
                            <span>
                              <strong>{link.label}</strong>
                              <small>{presentation.label}</small>
                            </span>
                            <Icon name="arrow" />
                          </a>
                        ) : (
                          <span>{link.label}: update this link in Edit profile.</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="sp-empty">
                  {linkedIn
                    ? 'Your LinkedIn profile is linked in the professional sidebar.'
                    : 'Add a portfolio, GitHub profile or personal website.'}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
      {profile.completion && (
        <div className="sp-completion-wrap" ref={completionRef}>
          <ProfileCompletion completion={profile.completion} onEdit={onEdit} />
        </div>
      )}
    </div>
  );
}
