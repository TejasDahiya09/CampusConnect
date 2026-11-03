import { useProfileDraft } from './profile-draft-state';
import { useState, type FormEvent } from 'react';
import { ProfileAvatar } from './ProfileAvatar';
import { predefinedAvatars } from './profile-avatar-catalog';
import type {
  PredefinedAvatarId,
  ProfileOptions,
  ProfilePatch,
  StudentProfile,
} from './profile.types';

interface EditProfileFormProps {
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onSave: (patch: ProfilePatch) => Promise<boolean>;
  readonly options: ProfileOptions;
  readonly profile: StudentProfile;
}

export function EditProfileForm({
  isSaving,
  onCancel,
  onSave,
  options,
  profile,
}: EditProfileFormProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [departmentId, setDepartmentId] = useState(profile.departmentId ?? '');
  const [year, setYear] = useState(profile.year?.toString() ?? '');
  const [location, setLocation] = useState(profile.location ?? '');
  const [avatarId, setAvatarId] = useState<PredefinedAvatarId | ''>(
    profile.avatar?.type === 'predefined' ? profile.avatar.id : '',
  );

  const [avatarChanged, setAvatarChanged] = useState(false);
  const selectedAvatarId = avatarChanged
    ? avatarId
    : profile.avatar?.type === 'predefined'
      ? profile.avatar.id
      : '';
  useProfileDraft(
    'identity',
    displayName.trim() !== profile.displayName.trim() ||
      bio.trim() !== (profile.bio ?? '').trim() ||
      departmentId !== (profile.departmentId ?? '') ||
      year !== (profile.year?.toString() ?? '') ||
      location.trim() !== (profile.location ?? '').trim() ||
      (profile.avatar?.type !== 'photo' &&
        selectedAvatarId !== (profile.avatar?.type === 'predefined' ? profile.avatar.id : '')),
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave({
      ...(profile.avatar?.type === 'photo'
        ? {}
        : {
            avatar:
              selectedAvatarId === ''
                ? null
                : { id: selectedAvatarId, type: 'predefined' as const },
          }),
      bio: bio.trim() || null,
      departmentId: departmentId || null,
      displayName,
      location: location.trim() || null,
      year: year ? Number(year) : null,
    });
  };

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <fieldset disabled={isSaving} className="contents">
        <label className="grid gap-2 text-sm text-slate-300">
          Display name
          <input
            className="cc-field px-4 py-3"
            maxLength={120}
            minLength={2}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            value={displayName}
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-300">
          Bio
          <textarea
            className="cc-field min-h-32 resize-y px-4 py-3"
            maxLength={1000}
            onChange={(event) => setBio(event.target.value)}
            placeholder="What are you learning, building, or exploring?"
            value={bio}
          />
          <span className="text-right text-xs text-slate-500">{bio.length}/1000</span>
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-slate-300">
            Department
            <select
              className="cc-field px-4 py-3"
              onChange={(event) => setDepartmentId(event.target.value)}
              value={departmentId}
            >
              <option value="">Not selected</option>
              {options.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name} ({department.code})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Study year
            <select
              className="cc-field px-4 py-3"
              onChange={(event) => setYear(event.target.value)}
              value={year}
            >
              <option value="">Not selected</option>
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  Year {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="grid gap-2 text-sm text-slate-300">
          Campus location
          <input
            className="cc-field px-4 py-3"
            maxLength={180}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Hostel, campus, or city"
            value={location}
          />
        </label>
        <fieldset className="grid gap-3">
          <legend className="text-sm text-slate-300">Profile avatar</legend>
          {profile.avatar?.type === 'photo' && (
            <p>Remove your uploaded photo in the photo editor to choose a predefined avatar.</p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {predefinedAvatars.map((avatar) => (
              <label
                className={`cursor-pointer rounded-2xl border p-3 text-center transition ${
                  selectedAvatarId === avatar.id
                    ? 'border-cyan-300 bg-cyan-300/10'
                    : 'border-white/10 hover:bg-white/5'
                }`}
                key={avatar.id}
              >
                <input
                  checked={selectedAvatarId === avatar.id}
                  className="sr-only"
                  name="avatar"
                  disabled={isSaving || profile.avatar?.type === 'photo'}
                  onChange={() => {
                    setAvatarChanged(true);
                    setAvatarId(avatar.id);
                  }}
                  type="radio"
                />
                <span className="flex justify-center">
                  <ProfileAvatar
                    avatar={{ id: avatar.id, type: 'predefined' }}
                    fallback="CC"
                    size="small"
                  />
                </span>
                <span className="mt-2 block text-xs text-slate-300">{avatar.label}</span>
              </label>
            ))}
          </div>
          <button
            className="cc-button cc-button--secondary sp-edit-initials"
            aria-pressed={selectedAvatarId === '' && profile.avatar?.type !== 'photo'}
            disabled={isSaving || profile.avatar?.type === 'photo'}
            onClick={() => {
              setAvatarChanged(true);
              setAvatarId('');
            }}
            type="button"
          >
            Use initials instead
          </button>
        </fieldset>
        <div className="flex justify-end gap-3">
          <button
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button className="cc-button cc-button--primary" disabled={isSaving} type="submit">
            {isSaving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
