import { useId, useState } from 'react';
import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import {
  lostFoundCategories,
  lostFoundDateError,
  publicReportStatuses,
  reportLabel,
} from './lost-found-presentation';
import type { LostFoundFilters as Filters } from './lost-found.types';

export function LostFoundFilters({
  value,
  onApply,
  onClear,
}: {
  readonly value: Filters;
  readonly onApply: (value: Filters) => void;
  readonly onClear: () => void;
}) {
  const [draft, setDraft] = useState(value),
    [error, setError] = useState<string | null>(null);
  const id = useId();
  const set = <K extends keyof Filters>(key: K, next: Filters[K]) =>
    setDraft((current) => ({ ...current, [key]: next }));
  return (
    <form
      className="cc-lf-filters"
      onSubmit={(event) => {
        event.preventDefault();
        const problem = lostFoundDateError(draft.dateFrom, draft.dateTo);
        setError(problem);
        if (!problem)
          onApply({
            ...draft,
            category: draft.category.trim(),
            location: draft.location.trim(),
            page: 1,
          });
      }}
    >
      <h2>
        <Icon name="filter" />
        Refine your search
      </h2>
      <label className="cc-label">
        Report type
        <select
          className="cc-field"
          value={draft.type}
          onChange={(event) => set('type', event.target.value as Filters['type'])}
        >
          <option value="">Lost &amp; Found</option>
          <option value="LOST">Lost items</option>
          <option value="FOUND">Found items</option>
        </select>
      </label>
      <label className="cc-label">
        Category
        <input
          className="cc-field"
          list={id}
          maxLength={100}
          value={draft.category}
          onChange={(event) => set('category', event.target.value)}
          placeholder="All categories"
        />
        <datalist id={id}>
          {lostFoundCategories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </label>
      <label className="cc-label">
        Report status
        <select
          className="cc-field"
          value={draft.status}
          onChange={(event) => set('status', event.target.value as Filters['status'])}
        >
          <option value="">All public statuses</option>
          {publicReportStatuses.map((status) => (
            <option key={status} value={status}>
              {reportLabel(status)}
            </option>
          ))}
        </select>
      </label>
      <label className="cc-label">
        Location
        <input
          className="cc-field"
          maxLength={180}
          placeholder="Any campus location"
          value={draft.location}
          onChange={(event) => set('location', event.target.value)}
        />
      </label>
      <fieldset>
        <legend>Incident date</legend>
        <label className="cc-label">
          From
          <input
            className="cc-field"
            type="date"
            value={draft.dateFrom}
            onChange={(event) => set('dateFrom', event.target.value)}
          />
        </label>
        <label className="cc-label">
          To
          <input
            className="cc-field"
            type="date"
            value={draft.dateTo}
            onChange={(event) => set('dateTo', event.target.value)}
          />
        </label>
      </fieldset>
      {error ? (
        <p className="cc-lf-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="cc-lf-filter-actions">
        <Button type="submit">Apply filters</Button>
        <Button type="button" variant="ghost" onClick={onClear}>
          Clear all
        </Button>
      </div>
    </form>
  );
}
