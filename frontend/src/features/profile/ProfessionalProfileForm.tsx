import { useProfileDraft } from './profile-draft-state';
import { useRef, useState } from 'react';
import {
  emptyProfessional,
  type ProfessionalDetails,
  type ProfessionalState,
} from './professional-profile';
import { professionalError } from './useProfessionalProfile';
import { ApiClientError } from '../../services/api-client';
import type { StudentProfile } from './profile.types';
export function ProfessionalProfileForm({
  state,
  onSave,
  loading = false,
  loadError = null,
  onRetry,
  onIdentity,
  onLink,
}: {
  readonly state: ProfessionalState;
  readonly profile: StudentProfile;
  readonly onSave: (details: ProfessionalDetails, version: string) => Promise<ProfessionalState>;
  readonly loading?: boolean;
  readonly loadError?: string | null;
  readonly onRetry?: () => void;
  readonly onIdentity: () => void;
  readonly onLink: () => void;
}) {
  const [localDraft, setLocalDraft] = useState(state.details ?? emptyProfessional),
    [dirty, setDirty] = useState(false),
    [baseVersion, setBaseVersion] = useState(state.version),
    [conflict, setConflict] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  useProfileDraft('professional', dirty);
  const submitting = useRef(false);
  const draft = dirty ? localDraft : (state.details ?? emptyProfessional);
  const stale = dirty && baseVersion !== state.version;
  const setDraft = (value: ProfessionalDetails) => {
    if (!dirty) setBaseVersion(state.version);
    setLocalDraft(value);
    setDirty(true);
    setNotice(null);
  };
  return (
    <form
      className="sp-native-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          !state.available ||
          busy ||
          submitting.current ||
          loading ||
          loadError ||
          stale ||
          conflict ||
          !state.version
        )
          return;
        submitting.current = true;
        setBusy(true);
        setError(null);
        setNotice(null);
        void onSave(draft, dirty ? baseVersion! : state.version)
          .then((saved) => {
            if (saved) {
              setLocalDraft(saved.details ?? emptyProfessional);
              setBaseVersion(saved.version);
              setDirty(false);
            }
            setNotice('Professional profile saved.');
          })
          .catch((failure: unknown) => {
            setError(professionalError(failure));
            if (failure instanceof ApiClientError && failure.status === 409) setConflict(true);
          })
          .finally(() => {
            submitting.current = false;
            setBusy(false);
          });
      }}
    >
      <p className="sp-professional-meta">
        Student-entered information, stored separately from your biography. These additions are
        owner-only.
      </p>
      <div className="sp-native-existing">
        <button type="button" className="sp-text-action" onClick={onIdentity}>
          Personal information
        </button>
        <button type="button" className="sp-text-action" onClick={onLink}>
          Edit LinkedIn URL in Portfolio
        </button>
      </div>
      {loading && <p role="status">Loading professional details...</p>}
      {loadError && (
        <div>
          <p role="alert">{loadError}</p>
          <button type="button" className="sp-text-action" onClick={onRetry}>
            Retry professional details
          </button>
        </div>
      )}
      {(stale || conflict) && (
        <div role="alert">
          <p>Newer saved details must be reviewed. Your unsaved draft has not been replaced.</p>
          <button type="button" className="sp-text-action" onClick={onRetry} disabled={loading}>
            Reload latest professional details
          </button>
          <button
            type="button"
            className="sp-text-action"
            disabled={loading || !!loadError || !stale}
            onClick={() => {
              setLocalDraft(state.details ?? emptyProfessional);
              setBaseVersion(state.version);
              setDirty(false);
              setConflict(false);
              setError(null);
            }}
          >
            Use latest saved details (discard draft)
          </button>
        </div>
      )}
      {!state.available && !loading && !loadError && (
        <p className="sp-notice" role="status">
          Professional saving is not available yet. Your personal details and portfolio can still be
          edited.
        </p>
      )}
      <fieldset disabled={!state.available || busy || loading || !!loadError}>
        <label>
          Professional headline
          <input
            className="cc-field"
            maxLength={180}
            value={draft.headline ?? ''}
            onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
          />
        </label>
        <div className="sp-native-form-group">
          <h3>Education</h3>
          {draft.education.map((entry, i) => (
            <fieldset className="sp-native-entry-form" key={i}>
              <legend>Education {i + 1}</legend>
              {(['institution', 'qualification'] as const).map((key) => (
                <label key={key}>
                  {key === 'institution' ? 'Institution' : 'Qualification'}
                  <input
                    className="cc-field"
                    required={key === 'institution'}
                    maxLength={180}
                    value={entry[key]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        education: draft.education.map((v, j) =>
                          j === i ? { ...v, [key]: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className="sp-text-action"
                onClick={() =>
                  setDraft({ ...draft, education: draft.education.filter((_, j) => j !== i) })
                }
              >
                Remove education {i + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="cc-button cc-button--secondary"
            disabled={draft.education.length >= 5}
            onClick={() =>
              setDraft({
                ...draft,
                education: [...draft.education, { institution: '', qualification: '' }],
              })
            }
          >
            Add education
          </button>
        </div>
        <div className="sp-native-form-group">
          <h3>
            Experience <span>(optional)</span>
          </h3>
          {draft.experience.map((entry, i) => (
            <fieldset className="sp-native-entry-form" key={i}>
              <legend>Experience {i + 1}</legend>
              {(['role', 'organization', 'description'] as const).map((key) => (
                <label key={key}>
                  {key === 'role'
                    ? 'Role'
                    : key === 'organization'
                      ? 'Organization'
                      : 'Description'}
                  {key === 'description' ? (
                    <textarea
                      className="cc-field"
                      maxLength={1000}
                      value={entry[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          experience: draft.experience.map((v, j) =>
                            j === i ? { ...v, [key]: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  ) : (
                    <input
                      className="cc-field"
                      required={key === 'role'}
                      maxLength={180}
                      value={entry[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          experience: draft.experience.map((v, j) =>
                            j === i ? { ...v, [key]: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  )}
                </label>
              ))}
              <button
                type="button"
                className="sp-text-action"
                onClick={() =>
                  setDraft({ ...draft, experience: draft.experience.filter((_, j) => j !== i) })
                }
              >
                Remove experience {i + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="cc-button cc-button--secondary"
            disabled={draft.experience.length >= 5}
            onClick={() =>
              setDraft({
                ...draft,
                experience: [...draft.experience, { role: '', organization: '', description: '' }],
              })
            }
          >
            Add experience
          </button>
        </div>
        <button
          className="cc-button cc-button--primary"
          type="submit"
          disabled={busy || stale || conflict || !state.version}
        >
          {busy ? 'Saving…' : 'Save professional profile'}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="sp-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="sp-notice">
          {notice}
        </p>
      )}
    </form>
  );
}
