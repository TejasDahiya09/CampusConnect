import { ProfileAvatar } from './ProfileAvatar';
import { Icon } from '../../components/Icon';
import { profilePortfolio } from './profile-overview';
import type { StudentProfile } from './profile.types';
import type { ProfessionalDetails } from './professional-profile';
export function ProfessionalProfileCard({
  profile,
  details,
  storageAvailable = false,
  loading = false,
  loadError = null,
  onRetry,
  onEdit,
  onEditLink,
}: {
  readonly profile: StudentProfile;
  readonly details: ProfessionalDetails | null;
  readonly storageAvailable?: boolean;
  readonly loading?: boolean;
  readonly loadError?: string | null;
  readonly onRetry?: () => void;
  readonly onEdit: () => void;
  readonly onEditLink: () => void;
}) {
  const { linkedIn } = profilePortfolio(profile.portfolioLinks);
  const visible = storageAvailable ? details : null;
  const populated = !!(
    visible?.headline ||
    visible?.education.length ||
    visible?.experience.length
  );
  return (
    <section
      className={`sp-panel sp-professional${populated ? ' is-populated' : ' is-setup'}`}
      aria-labelledby="sp-professional-title"
    >
      <header className="sp-professional-cover">
        <span className="sp-native-mark" aria-hidden="true">
          C
        </span>
        <div>
          <p className="sp-kicker">CampusConnect</p>
          <h2 id="sp-professional-title">Professional profile</h2>
        </div>
      </header>
      <div className="sp-professional-body">
        {profile.avatar?.type === 'photo' && (
          <ProfileAvatar avatar={profile.avatar} fallback={profile.displayName} size="small" />
        )}
        {(loading || loadError) && !storageAvailable ? (
          <div className="sp-professional-empty">
            <h3>{loading ? 'Loading professional details' : 'Professional details unavailable'}</h3>
            <p>
              {loading
                ? 'Retrieving your saved professional details.'
                : 'Your saved details could not be retrieved. This does not mean they are empty.'}
            </p>
          </div>
        ) : populated ? (
          <>
            {visible?.headline && <p className="sp-native-headline">{visible.headline}</p>}
            {profile.location && <p className="sp-native-location">{profile.location}</p>}
            {!!visible?.education.length && (
              <section className="sp-native-section" aria-labelledby="sp-education">
                <h3 id="sp-education">
                  <Icon name="profile" />
                  Education
                </h3>
                {visible.education.map((e, i) => (
                  <div className="sp-native-entry" key={i}>
                    <strong>{e.institution}</strong>
                    {e.qualification && <p>{e.qualification}</p>}
                  </div>
                ))}
              </section>
            )}
            {!!visible?.experience.length && (
              <section className="sp-native-section" aria-labelledby="sp-experience">
                <h3 id="sp-experience">
                  <Icon name="briefcase" />
                  Experience
                </h3>
                {visible.experience.map((e, i) => (
                  <div className="sp-native-entry" key={i}>
                    <strong>{e.role}</strong>
                    {e.organization && <p>{e.organization}</p>}
                    {e.description && <p className="sp-native-description">{e.description}</p>}
                  </div>
                ))}
              </section>
            )}
          </>
        ) : (
          <div className="sp-professional-empty">
            <h3>Your professional story starts here.</h3>
            <p>Showcase your education, experience and professional links.</p>
          </div>
        )}
        <div className="sp-professional-link">
          {linkedIn ? (
            <a
              className="cc-button cc-button--secondary sp-linkedin-link"
              href={linkedIn.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View LinkedIn Profile (opens in a new tab)"
            >
              <Icon name="linkedin" />
              <span>View LinkedIn Profile</span>
              <Icon name="arrow" />
            </a>
          ) : (
            <button
              className="cc-button cc-button--secondary sp-linkedin-link"
              type="button"
              onClick={onEditLink}
            >
              Add LinkedIn Profile
              <Icon name="arrow" />
            </button>
          )}
        </div>
        {loading ? (
          <p role="status">Loading professional details...</p>
        ) : loadError ? (
          <div>
            <p role="alert">{loadError}</p>
            <button type="button" className="sp-text-action" onClick={onRetry}>
              Retry professional details
            </button>
          </div>
        ) : storageAvailable ? (
          <button className="sp-text-action sp-native-edit" type="button" onClick={onEdit}>
            Edit professional profile
            <Icon name="arrow" />
          </button>
        ) : (
          <p className="sp-setup-status">
            Professional details pending setup. Links are available now.
          </p>
        )}
        {populated && (
          <p className="sp-source">
            Student-supplied professional additions. Only you can see them.
          </p>
        )}
      </div>
    </section>
  );
}
