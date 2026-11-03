import { ProfileAvatar } from './ProfileAvatar';
import { ProfileDraftProvider } from './profile-drafts';
import { useProfileDraft } from './profile-draft-state';
import { ProfilePhotoEditor } from './ProfilePhotoEditor';
import { publishOwnAvatar } from './own-avatar';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { ApiClientError } from '../../services/api-client';
import { AchievementsManager } from './AchievementsManager';
import { EditProfileForm } from './EditProfileForm';
import { InterestsManager } from './InterestsManager';
import { PortfolioManager } from './PortfolioManager';
import { ProfileOverview } from './ProfileOverview';
import { ProfessionalProfileForm } from './ProfessionalProfileForm';
import { useProfessionalProfile } from './useProfessionalProfile';
import { Icon } from '../../components/Icon';
import './profile.css';
import './profile-editor.css';
import { ProfileSection } from './ProfileSection';
import { SkillsManager } from './SkillsManager';
import { ResumeAnalyzer } from './ResumeAnalyzer';
import {
  addInterest,
  addSkill,
  createAchievement,
  createPortfolioLink,
  deleteAchievement,
  deletePortfolioLink,
  getMyProfile,
  getProfileOptions,
  removeInterest,
  removeSkill,
  updateAchievement,
  updateMyProfile,
  updatePortfolioLink,
  updateSkill,
} from './profile-service';
import type { ProfileOptions, StudentProfile } from './profile.types';

const emptyOptions: ProfileOptions = { departments: [], interests: [], skills: [] };

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiClientError && error.status === 401) {
    return 'Your session expired. Sign in again to continue.';
  }
  return error instanceof Error ? error.message : 'The profile request could not be completed.';
};

export function ProfilePage() {
  const { applicationUser } = useAuth();
  return (
    <ProfileDraftProvider
      key={`${applicationUser?.id ?? 'signed-out'}:${applicationUser?.status ?? 'unavailable'}`}
    >
      <OwnerProfileWorkspace />
    </ProfileDraftProvider>
  );
}

function OwnerProfileWorkspace() {
  const { applicationUser } = useAuth();
  const [photoOpen, setPhotoOpen] = useState(false);
  const [section, setSection] = useState('identity');
  const requestedSection = useRef('identity');
  const [visited, setVisited] = useState<ReadonlySet<string>>(new Set());
  const [resumeOpened, setResumeOpened] = useState(false);
  const editContent = useRef<HTMLDivElement>(null);
  const navigationFocus = useRef<'panel' | 'workspace' | 'overview' | null>(null);
  const mutationLock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const professionalRequest = useProfessionalProfile();
  const professional = professionalRequest.state;
  const [options, setOptions] = useState<ProfileOptions>(emptyOptions);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editorOpened, setEditorOpened] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useProfileDraft('pending-request', isSaving);
  const sections = [
    ['identity', 'Personal information'],
    ['skills', 'Skills & interests'],
    ['achievements', 'Achievements'],
    ['portfolio', 'Portfolio'],
    ['professional', 'Professional details'],
  ] as const;
  const selectSection = (value: string) => {
    if (value === requestedSection.current) return;
    requestedSection.current = value;
    navigationFocus.current = 'panel';
    setVisited((previous) => new Set([...previous, value]));
    setSection(value);
  };
  const openEditor = (requested?: string) => {
    const target = requested === 'interests' ? 'skills' : (requested ?? 'identity');
    requestedSection.current = target;
    navigationFocus.current = requested ? 'panel' : 'workspace';
    setVisited((previous) => new Set([...previous, target]));
    setSection(target);
    setEditorOpened(true);
    setIsEditing(true);
  };
  const closeEditor = () => {
    navigationFocus.current = 'overview';
    setIsEditing(false);
  };
  useLayoutEffect(() => {
    const request = navigationFocus.current;
    if (!request) return;
    navigationFocus.current = null;
    const panel = document.getElementById('profile-edit-' + section);
    const target =
      request === 'overview'
        ? document.getElementById('profile-overview-heading')
        : request === 'workspace'
          ? document.getElementById('profile-edit-heading')
          : panel?.querySelector('h2');
    if (!(target instanceof HTMLElement)) return;
    const header = document.querySelector('.cc-top-nav')?.getBoundingClientRect().height ?? 74;
    const mobileNav = document.querySelector('.sp-edit-mobile-nav');
    const extra =
      mobileNav instanceof HTMLElement && mobileNav.getClientRects().length
        ? mobileNav.offsetHeight + 12
        : 0;
    if (mobileNav instanceof HTMLElement && mobileNav.getClientRects().length) {
      const selected = mobileNav.querySelector('[aria-current]');
      if (selected instanceof HTMLElement) {
        const item = selected.getBoundingClientRect(),
          strip = mobileNav.getBoundingClientRect();
        const delta =
          item.left < strip.left
            ? item.left - strip.left - 4
            : item.right > strip.right
              ? item.right - strip.right + 4
              : 0;
        if (delta)
          mobileNav.scrollBy({
            left: delta,
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
          });
      }
    }
    const top = target.getBoundingClientRect().top;
    const feedback =
      document.querySelector('.sp-edit-feedback')?.getBoundingClientRect().height ?? 0;
    const safeTop = header + extra + (feedback ? feedback + 8 : 0) + 16;
    if (request !== 'panel' || top < safeTop || top > window.innerHeight * 0.65)
      window.scrollTo({ top: Math.max(0, window.scrollY + top - safeTop), behavior: 'instant' });
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }, [isEditing, section]);
  useEffect(() => {
    if (!isEditing) return;
    let frame = 0;
    const keepVisible = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (
          !(field instanceof HTMLElement) ||
          !editContent.current?.contains(field) ||
          !field.matches('input,textarea,select,button')
        )
          return;
        const viewport = window.visualViewport;
        const nav = document.querySelector('.cc-mobile-nav')?.getBoundingClientRect();
        const bottom =
          Math.min(
            window.innerHeight,
            (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
            nav?.height ? nav.top : Infinity,
          ) - 16;
        const rect = field.getBoundingClientRect();
        if (rect.bottom > bottom)
          window.scrollBy({ top: rect.bottom - bottom, behavior: 'instant' });
        else {
          const header =
            document.querySelector('.cc-top-nav')?.getBoundingClientRect().height ?? 74;
          const shortcuts =
            document.querySelector('.sp-edit-mobile-nav')?.getBoundingClientRect().height ?? 0;
          const feedback =
            document.querySelector('.sp-edit-feedback')?.getBoundingClientRect().height ?? 0;
          const safeTop = header + shortcuts + feedback + 16;
          if (rect.top < safeTop) window.scrollBy({ top: rect.top - safeTop, behavior: 'instant' });
        }
      });
    };
    const content = editContent.current;
    content?.addEventListener('focusin', keepVisible);
    window.visualViewport?.addEventListener('resize', keepVisible);
    return () => {
      cancelAnimationFrame(frame);
      content?.removeEventListener('focusin', keepVisible);
      window.visualViewport?.removeEventListener('resize', keepVisible);
    };
  }, [isEditing]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    void Promise.all([getMyProfile(), getProfileOptions()])
      .then(([nextProfile, nextOptions]) => {
        if (!active) return;
        setProfile(nextProfile);
        if (applicationUser?.id) publishOwnAvatar(applicationUser.id, nextProfile.avatar);
        setOptions(nextOptions);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey, applicationUser?.id]);

  const runMutation = async (operation: () => Promise<StudentProfile>): Promise<boolean> => {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await operation();
      if (!alive.current) return false;
      setProfile(updated);
      if (applicationUser) publishOwnAvatar(applicationUser.id, updated.avatar);
      setNotice('Profile updated.');
      return true;
    } catch (mutationError) {
      if (alive.current) setError(getErrorMessage(mutationError));
      return false;
    } finally {
      mutationLock.current = false;
      if (alive.current) setIsSaving(false);
    }
  };

  if (isLoading && profile === null)
    return (
      <div
        className="cc-page cc-student-profile"
        aria-busy="true"
        role="status"
        aria-label="Loading student profile"
      >
        <span className="sr-only">Loading your CampusConnect profile…</span>
        <div className="sp-loading">
          <div className="cc-skeleton" />
          <div className="cc-skeleton" />
          <div className="cc-skeleton" />
        </div>
      </div>
    );
  if (profile === null)
    return (
      <div className="cc-page cc-student-profile">
        <section className="sp-panel sp-unavailable">
          <Icon name="profile" />
          <h1>Profile unavailable</h1>
          <p role="alert">{error ?? 'Your profile could not be loaded.'}</p>
          <button
            className="cc-button cc-button--primary"
            type="button"
            onClick={() => {
              setIsLoading(true);
              setReloadKey((value) => value + 1);
            }}
          >
            Try again
          </button>
        </section>
      </div>
    );
  return (
    <div className="cc-page cc-student-profile">
      {!isEditing && error && (
        <p className="sp-error" role="alert">
          {error}
        </p>
      )}
      {!isEditing && notice && (
        <p className="sp-notice" role="status">
          {notice}
        </p>
      )}
      <div hidden={isEditing}>
        <ProfileOverview
          profile={profile}
          onPhoto={() => setPhotoOpen(true)}
          professional={professional.details}
          professionalAvailable={professional.available}
          professionalLoading={professionalRequest.loading}
          professionalError={professionalRequest.error}
          onProfessionalRetry={() => void professionalRequest.reload()}
          onEdit={openEditor}
          refreshDisabled={
            photoOpen || isSaving || isEditing || isLoading || professionalRequest.pendingSave
          }
          onRefresh={() => {
            setIsLoading(true);
            setReloadKey((value) => value + 1);
            void professionalRequest.reload();
          }}
        />
      </div>
      {photoOpen && (
        <ProfilePhotoEditor
          avatar={profile.avatar}
          name={profile.displayName}
          onClose={() => setPhotoOpen(false)}
          onSaved={(avatar) => {
            setProfile({ ...profile, avatar });
            if (applicationUser) publishOwnAvatar(applicationUser.id, avatar);
            setNotice('Profile photo updated.');
          }}
        />
      )}
      {editorOpened && (
        <div className="sp-editor" hidden={!isEditing}>
          <header className="sp-editor-header">
            <div>
              <p className="cc-eyebrow">Profile management</p>
              <h1 id="profile-edit-heading" tabIndex={-1}>
                Edit your profile
              </h1>
              <p>Manage your details, skills and professional links.</p>
            </div>
            <button
              className="cc-button cc-button--secondary"
              type="button"
              disabled={isSaving || professionalRequest.pendingSave}
              onClick={closeEditor}
            >
              Back to profile
            </button>
          </header>
          <p className="sp-editor-note">
            Save each section separately. Unsaved drafts stay while switching sections or viewing
            your overview.
          </p>
          <div className="sp-edit-layout">
            <nav className="sp-edit-nav" aria-label="Profile editing sections">
              {sections.map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-current={section === key ? 'page' : undefined}
                  onClick={() => selectSection(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <nav className="sp-edit-mobile-nav" aria-label="Profile section shortcuts">
              {sections.map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-current={section === key ? 'page' : undefined}
                  onClick={() => selectSection(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="sp-edit-content" ref={editContent}>
              {(error || notice) && (
                <div className="sp-edit-feedback">
                  {error && (
                    <p className="sp-error" role="alert">
                      {error}
                    </p>
                  )}
                  {notice && (
                    <p className="sp-notice" role="status">
                      {notice}
                    </p>
                  )}
                </div>
              )}
              <div
                data-active={section === 'identity'}
                hidden={section !== 'identity'}
                id="profile-edit-identity"
                tabIndex={-1}
                role="group"
                aria-label="Edit identity and biography"
              >
                {visited.has('identity') && (
                  <ProfileSection
                    title="Personal information"
                    description="Update your student-owned profile details."
                  >
                    <div className="sp-edit-photo">
                      <ProfileAvatar
                        avatar={profile.avatar}
                        fallback={profile.displayName}
                        size="small"
                      />
                      <p>Profile photo</p>
                      <button
                        className="cc-button cc-button--secondary"
                        type="button"
                        onClick={() => setPhotoOpen(true)}
                      >
                        Manage profile photo
                      </button>
                      <p>Upload and crop a photo, or choose an avatar below.</p>
                    </div>
                    <EditProfileForm
                      isSaving={isSaving}
                      onCancel={closeEditor}
                      onSave={(patch) => runMutation(() => updateMyProfile(patch))}
                      options={options}
                      profile={profile}
                    />
                  </ProfileSection>
                )}
              </div>
              <div
                data-active={section === 'professional'}
                hidden={section !== 'professional'}
                id="profile-edit-professional"
                tabIndex={-1}
                role="group"
                aria-label="Edit professional profile"
              >
                {visited.has('professional') && (
                  <ProfileSection
                    title="Professional Profile"
                    description="Manage your student-supplied professional information."
                  >
                    <ProfessionalProfileForm
                      state={professional}
                      profile={profile}
                      loading={professionalRequest.loading}
                      loadError={professionalRequest.error}
                      onRetry={() => void professionalRequest.reload()}
                      onSave={professionalRequest.save}
                      onIdentity={() => {
                        selectSection('identity');
                      }}
                      onLink={() => {
                        selectSection('portfolio');
                      }}
                    />
                  </ProfileSection>
                )}
              </div>
              <div
                data-active={section === 'skills'}
                hidden={section !== 'skills'}
                id="profile-edit-skills"
                tabIndex={-1}
                role="group"
                aria-label="Edit skills"
              >
                {visited.has('skills') && (
                  <ProfileSection
                    description="Share what you know and choose your proficiency."
                    title="Skills"
                  >
                    <SkillsManager
                      disabled={isSaving}
                      onAdd={(name, proficiency) => runMutation(() => addSkill(name, proficiency))}
                      onRemove={(id) => runMutation(() => removeSkill(id))}
                      onUpdate={(id, proficiency) =>
                        runMutation(() => updateSkill(id, proficiency))
                      }
                      options={options}
                      skills={profile.skills}
                    />
                  </ProfileSection>
                )}
              </div>
              <div hidden={section !== 'skills'}>
                {visited.has('skills') && (
                  <details
                    className="sp-edit-resume"
                    onToggle={(event) => {
                      if (event.currentTarget.open) setResumeOpened(true);
                    }}
                  >
                    <summary>Analyze resume for skills</summary>
                    {resumeOpened && (
                      <ProfileSection
                        description="Extract skills from a PDF or DOCX locally through CampusConnect. Nothing is added without your approval."
                        title="Analyze resume"
                      >
                        <ResumeAnalyzer
                          disabled={isSaving}
                          existingSkills={profile.skills}
                          onAddSkill={(name, proficiency) =>
                            runMutation(() => addSkill(name, proficiency))
                          }
                        />
                      </ProfileSection>
                    )}
                  </details>
                )}
              </div>
              <div
                hidden={section !== 'skills'}
                id="profile-edit-interests"
                tabIndex={-1}
                role="group"
                aria-label="Edit interests"
              >
                {visited.has('skills') && (
                  <ProfileSection title="Interests">
                    <InterestsManager
                      disabled={isSaving}
                      interests={profile.interests}
                      onAdd={(name) => runMutation(() => addInterest(name))}
                      onRemove={(id) => runMutation(() => removeInterest(id))}
                      options={options}
                    />
                  </ProfileSection>
                )}
              </div>

              <div
                data-active={section === 'achievements'}
                hidden={section !== 'achievements'}
                id="profile-edit-achievements"
                tabIndex={-1}
                role="group"
                aria-label="Edit achievements"
              >
                {visited.has('achievements') && (
                  <ProfileSection title="Achievements">
                    <AchievementsManager
                      achievements={profile.achievements}
                      disabled={isSaving}
                      onCreate={(draft) =>
                        runMutation(() =>
                          createAchievement({
                            awardedAt: draft.awardedAt || null,
                            description: draft.description.trim() || null,
                            title: draft.title,
                          }),
                        )
                      }
                      onDelete={(id) => runMutation(() => deleteAchievement(id))}
                      onUpdate={(id, draft) =>
                        runMutation(() =>
                          updateAchievement(id, {
                            awardedAt: draft.awardedAt || null,
                            description: draft.description.trim() || null,
                            title: draft.title,
                          }),
                        )
                      }
                    />
                  </ProfileSection>
                )}
              </div>

              <div
                data-active={section === 'portfolio'}
                hidden={section !== 'portfolio'}
                id="profile-edit-portfolio"
                tabIndex={-1}
                role="group"
                aria-label="Edit portfolio links"
              >
                {visited.has('portfolio') && (
                  <ProfileSection title="Portfolio links">
                    <PortfolioManager
                      disabled={isSaving}
                      links={profile.portfolioLinks}
                      onCreate={(draft) =>
                        runMutation(() =>
                          createPortfolioLink({
                            label: draft.label,
                            sortOrder: Number(draft.sortOrder || 0),
                            url: draft.url,
                          }),
                        )
                      }
                      onDelete={(id) => runMutation(() => deletePortfolioLink(id))}
                      onUpdate={(id, draft) =>
                        runMutation(() =>
                          updatePortfolioLink(id, {
                            label: draft.label,
                            sortOrder: Number(draft.sortOrder || 0),
                            url: draft.url,
                          }),
                        )
                      }
                    />
                  </ProfileSection>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
