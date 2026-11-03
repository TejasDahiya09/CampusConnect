import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Icon } from '../../components/Icon';
import { messagingService } from '../messaging/messaging-service';
import { getPublicProfile } from './profile-service';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfileSection } from './ProfileSection';
import { EmptyState, Skeleton } from '../../components/ui';
import { isValidPublicProfileId, publicProfileErrorMessage } from './public-profile';
import { isLinkedInProfileUrl } from './linkedin';
import type { StudentProfile } from './profile.types';
import { ReportAction } from '../moderation/ReportAction';

export function PublicProfilePage({ userId }: { readonly userId: string }) {
  const navigate = useNavigate();
  const { applicationUser } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(isValidPublicProfileId(userId));
  const [error, setError] = useState<string | null>(
    isValidPublicProfileId(userId) ? null : 'This public profile link is invalid.',
  );

  useEffect(() => {
    if (!isValidPublicProfileId(userId)) return;
    let active = true;
    void getPublicProfile(userId)
      .then((nextProfile) => {
        if (active) setProfile(nextProfile);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(publicProfileErrorMessage(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  if (loading) {
    return (
      <main aria-busy="true" aria-label="Loading student profile" className="cc-page">
        <div className="cc-card mx-auto max-w-5xl p-6 sm:p-8">
          <div className="flex items-center gap-5">
            <Skeleton className="size-20 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="mt-3 h-4 w-72 max-w-full" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (profile === null) {
    return (
      <div className="cc-page">
        <div className="cc-card mx-auto max-w-xl">
          <EmptyState
            action={
              <Link className="cc-button cc-button--secondary" to="/profile">
                Return to your profile
              </Link>
            }
            description={error ?? 'This profile cannot be viewed.'}
            icon="profile"
            title="Profile unavailable"
          />
        </div>
      </div>
    );
  }

  const initials = profile.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

  return (
    <main className="cc-page">
      <Link className="cc-auth-link inline-flex items-center gap-2" to="/profile">
        <span aria-hidden="true">←</span> Back to your profile
      </Link>
      <header className="cc-public-profile-hero mt-5">
        <ProfileAvatar avatar={profile.avatar} fallback={initials} />
        <div className="flex-1">
          <p className="cc-eyebrow">CampusConnect student</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {profile.displayName}
          </h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--cc-muted)]">
            {profile.department ? <span>{profile.department.name}</span> : null}
            {profile.year ? <span>Year {profile.year}</span> : null}
            {profile.location ? <span>{profile.location}</span> : null}
          </div>
        </div>
        {applicationUser?.id !== userId ? (
          <div className="flex flex-wrap gap-2">
            <button
              className="cc-button cc-button--primary"
              onClick={() =>
                void messagingService
                  .open({ contextType: 'DIRECT', targetUserId: userId })
                  .then(({ id }) => navigate(`/messages/${id}`))
                  .catch((reason: unknown) =>
                    setError(
                      reason instanceof Error ? reason.message : 'Messaging is unavailable.',
                    ),
                  )
              }
              type="button"
            >
              Direct message
            </button>
            <ReportAction targetId={userId} targetType="PROFILE" />
          </div>
        ) : null}
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ProfileSection title="About">
          <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--cc-text-soft)]">
            {profile.bio ?? 'This student has not added a bio yet.'}
          </p>
        </ProfileSection>
        <ProfileSection title="Skills">
          {profile.skills.length ? (
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <span className="cc-badge" key={skill.id}>
                  {skill.name}
                  {skill.proficiency === null ? '' : ` · Level ${skill.proficiency}`}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--cc-muted)]">No skills shared yet.</p>
          )}
        </ProfileSection>
        <ProfileSection title="Interests">
          {profile.interests.length ? (
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((interest) => (
                <span className="cc-badge" key={interest.id}>
                  {interest.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--cc-muted)]">No interests shared yet.</p>
          )}
        </ProfileSection>
        <ProfileSection title="Achievements">
          {profile.achievements.length ? (
            <div className="grid gap-3">
              {profile.achievements.map((achievement) => (
                <article
                  className="rounded-[var(--cc-radius-md)] border border-[var(--cc-border)] bg-[var(--cc-panel-muted)] p-4"
                  key={achievement.id}
                >
                  <h2 className="font-medium">{achievement.title}</h2>
                  {achievement.awardedAt ? (
                    <p className="mt-1 text-xs text-[var(--cc-primary)]">{achievement.awardedAt}</p>
                  ) : null}
                  {achievement.description ? (
                    <p className="mt-2 text-sm text-[var(--cc-muted)]">{achievement.description}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--cc-muted)]">No achievements shared yet.</p>
          )}
        </ProfileSection>
        <ProfileSection title="Portfolio">
          {profile.portfolioLinks.length ? (
            <div className="grid gap-2">
              {profile.portfolioLinks.map((link) => (
                <a
                  aria-label={
                    isLinkedInProfileUrl(link.url) ? 'View LinkedIn profile' : `View ${link.label}`
                  }
                  className="cc-auth-link flex w-fit items-center gap-2"
                  href={link.url}
                  key={link.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  {isLinkedInProfileUrl(link.url) ? (
                    <Icon className="size-4" name="linkedin" />
                  ) : null}
                  <span>
                    {isLinkedInProfileUrl(link.url) ? 'View LinkedIn profile' : link.label}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--cc-muted)]">No portfolio links shared yet.</p>
          )}
        </ProfileSection>
      </div>
    </main>
  );
}
