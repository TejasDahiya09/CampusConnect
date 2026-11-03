import { Icon } from '../../components/Icon';
import type { ProfileCompletion as Completion } from './profile.types';
const criterionLabels: Readonly<Record<string, string>> = {
  achievement: 'Achievement',
  avatar: 'Profile avatar',
  bio: 'Bio',
  department: 'Department',
  displayName: 'Display name',
  interest: 'Interest',
  portfolioLink: 'Portfolio link',
  skill: 'Skill',
  universityVerified: 'Email verified',
  year: 'Study year',
};
export function ProfileCompletion({
  completion,
  onEdit,
}: {
  readonly completion: Completion;
  readonly onEdit?: (section?: string) => void;
}) {
  const missing = Object.values(completion.criteria).filter((value) => !value).length;
  const sections: Readonly<Record<string, string>> = {
    achievement: 'achievements',
    avatar: 'identity',
    bio: 'identity',
    department: 'identity',
    displayName: 'identity',
    interest: 'interests',
    portfolioLink: 'portfolio',
    skill: 'skills',
    year: 'identity',
  };
  const firstEditable = Object.entries(completion.criteria).find(
    ([key, complete]) => !complete && sections[key],
  )?.[0];
  return (
    <section className="sp-panel sp-completion" aria-labelledby="sp-completion-title">
      <div className="sp-completion-header">
        <h2 id="sp-completion-title">Profile completion</h2>
        <strong>{completion.percentage}%</strong>
      </div>
      <div
        className="sp-progress"
        role="progressbar"
        aria-label="Profile completion"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completion.percentage}
      >
        <span style={{ width: `${completion.percentage}%` }} />
      </div>
      <p>
        {completion.completed} of {completion.total} essentials complete
      </p>
      <p className="sp-completion-next">
        {missing
          ? 'A few finishing touches make your portfolio more complete.'
          : 'Your essential profile details are in place.'}
      </p>
      <details>
        <summary>
          {missing ? `${missing} essentials to complete` : 'All essentials complete'}
          <Icon name="chevron" />
        </summary>
        <ul>
          {Object.entries(completion.criteria).map(([criterion, complete]) => (
            <li key={criterion}>
              {!complete && sections[criterion] && onEdit ? (
                <button
                  type="button"
                  className="sp-criterion-action"
                  onClick={() => onEdit(sections[criterion])}
                >
                  {criterionLabels[criterion] ?? criterion}
                  <Icon name="arrow" />
                </button>
              ) : (
                <span>{criterionLabels[criterion] ?? criterion}</span>
              )}
              <span>
                {criterion === 'universityVerified'
                  ? complete
                    ? 'Verified'
                    : 'Not verified'
                  : complete
                    ? 'Complete'
                    : 'Not added'}
              </span>
            </li>
          ))}
        </ul>
      </details>
      {onEdit && firstEditable && (
        <button
          className="sp-text-action sp-completion-edit"
          type="button"
          onClick={() => onEdit(sections[firstEditable])}
        >
          Edit missing details
        </button>
      )}
    </section>
  );
}
