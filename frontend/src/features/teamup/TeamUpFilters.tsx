import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import type { TeamUpFilters as Filters } from './teamup.types';
import { teamUpLabel, teamUpStatuses } from './teamup-discovery';

export function TeamUpFilters({
  skill,
  status,
  onSkill,
  onStatus,
  onClear,
}: {
  readonly skill: string;
  readonly status: Filters['status'];
  readonly onSkill: (skill: string) => void;
  readonly onStatus: (status: Filters['status']) => void;
  readonly onClear: () => void;
}) {
  return (
    <div className="cc-tu-filters">
      <h2>
        <Icon name="filter" />
        Find your fit
      </h2>
      <label className="cc-label">
        Required skill
        <input
          className="cc-field"
          maxLength={50}
          value={skill}
          onChange={(event) => onSkill(event.target.value)}
          placeholder="e.g. React"
        />
        <span className="cc-tu-field-hint">Matches the project's exact skill name.</span>
      </label>
      <label className="cc-label">
        Project status
        <select
          className="cc-field"
          value={status}
          onChange={(event) => onStatus(event.target.value as Filters['status'])}
        >
          <option value="">All statuses</option>
          {teamUpStatuses.map((value) => (
            <option key={value} value={value}>
              {teamUpLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <Button variant="ghost" onClick={onClear}>
        Reset filters
      </Button>
      <p className="cc-tu-filter-note">
        <Icon name="team" />
        Member counts include the project owner. Review the project before applying.
      </p>
    </div>
  );
}
