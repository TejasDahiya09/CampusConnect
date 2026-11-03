import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ApiClientError } from '../../services/api-client';
import { servicesApi } from './services-service';
import type { ServiceDraft, StudentService } from './services.types';
import {
  addServiceSkill,
  changedServiceFields,
  emptyServiceDraft,
  normalizeServiceDraft,
  serviceDraftFrom,
  validateServiceDraft,
} from './services-management-state';
import { validServiceDetailId } from './service-detail-state';
import { ServiceFeaturedConsent } from './ServiceFeaturedConsent';
import './services-management.css';

const failure = (reason: unknown) =>
  reason instanceof ApiClientError
    ? reason.message
    : 'The service could not be saved. Check your connection and try again.';
export function ServiceOfferForm({
  initial,
  service,
  onSave,
}: {
  readonly initial: ServiceDraft;
  readonly service?: StudentService;
  readonly onSave: (draft: ServiceDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial),
    [skill, setSkill] = useState(''),
    [skillError, setSkillError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false),
    [touched, setTouched] = useState<Partial<Record<keyof ServiceDraft, boolean>>>({});
  const [saving, setSaving] = useState(false),
    [issue, setIssue] = useState<string | null>(null);
  const alive = useRef(true),
    lock = useRef(false),
    form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const errors = validateServiceDraft(draft);
  const show = (key: keyof ServiceDraft) => (submitted || touched[key] ? errors[key] : undefined);
  const set = (key: keyof ServiceDraft, value: ServiceDraft[keyof ServiceDraft]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const add = () => {
    const result = addServiceSkill(draft.skills, skill);
    setSkillError(result.error);
    if (!result.error) {
      set('skills', result.skills);
      setSkill('');
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    let candidate = draft;
    if (skill.trim()) {
      const result = addServiceSkill(candidate.skills, skill);
      if (result.error) {
        setSkillError(result.error);
        return;
      }
      candidate = { ...candidate, skills: result.skills };
      setDraft(candidate);
      setSkill('');
    }
    setSubmitted(true);
    if (Object.keys(validateServiceDraft(candidate)).length) {
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    if (service && !Object.keys(changedServiceFields(initial, candidate)).length) return;
    lock.current = true;
    setSaving(true);
    setIssue(null);
    try {
      await onSave(normalizeServiceDraft(candidate));
    } catch (reason) {
      if (alive.current) setIssue(failure(reason));
    } finally {
      lock.current = false;
      if (alive.current) setSaving(false);
    }
  };
  const field = (
    key: 'title' | 'category' | 'location',
    label: string,
    max: number,
    helper?: string,
  ) => (
    <label className="svm-field" htmlFor={`offer-${key}`}>
      {label}
      <input
        id={`offer-${key}`}
        value={draft[key]}
        maxLength={max}
        required={key !== 'location'}
        className="cc-field"
        onChange={(event) => set(key, event.target.value)}
        onBlur={() => setTouched((current) => ({ ...current, [key]: true }))}
        aria-invalid={!!show(key)}
        aria-describedby={show(key) ? `offer-${key}-error` : undefined}
      />
      {helper ? <span className="svm-help">{helper}</span> : null}
      {show(key) ? (
        <span className="svm-error" id={`offer-${key}-error`}>
          {show(key)}
        </span>
      ) : null}
    </label>
  );
  const unchanged = Boolean(
    service && !Object.keys(changedServiceFields(initial, draft)).length && !skill.trim(),
  );
  return (
    <form
      ref={form}
      className="svm-form"
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-busy={saving}
    >
      {issue ? (
        <div className="svm-notice svm-notice--error" role="alert">
          <strong>Could not save this service</strong>
          <p>{issue}</p>
          <p>
            Your entered information is still here. Review the current service if a lifecycle or
            ownership conflict is reported.
          </p>
        </div>
      ) : null}
      {submitted && Object.keys(errors).length ? (
        <p role="alert" className="svm-error-summary">
          Please check the highlighted fields.
        </p>
      ) : null}
      <fieldset disabled={saving}>
        <legend className="sr-only">Service offer</legend>
        <section className="svm-form-section" aria-labelledby="offer-basics">
          <div className="svm-section-heading">
            <span aria-hidden="true">01</span>
            <div>
              <h2 id="offer-basics">Service basics</h2>
              <p>Tell students what you can help with.</p>
            </div>
          </div>
          <div className="svm-two-fields">
            {field('title', 'Service title · required', 180)}
            {field(
              'category',
              'Category · required',
              100,
              'Use your own category, such as Tutoring or Creative design.',
            )}
          </div>
          <label className="svm-field" htmlFor="offer-description">
            Description · required
            <textarea
              id="offer-description"
              className="cc-field"
              rows={6}
              required
              maxLength={5000}
              value={draft.description}
              onChange={(event) => set('description', event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, description: true }))}
              aria-invalid={!!show('description')}
              aria-describedby={
                show('description') ? 'offer-description-error' : 'offer-description-help'
              }
            />
            <span className="svm-help" id="offer-description-help">
              Describe your service in 20–5,000 characters. Preserve any information students need
              to understand your offer.
            </span>
            {show('description') ? (
              <span className="svm-error" id="offer-description-error">
                {show('description')}
              </span>
            ) : null}
          </label>
        </section>
        <section className="svm-form-section" aria-labelledby="offer-pricing">
          <div className="svm-section-heading">
            <span aria-hidden="true">02</span>
            <div>
              <h2 id="offer-pricing">Pricing &amp; expertise</h2>
              <p>Set a clear price and add the skills you bring.</p>
            </div>
          </div>
          <fieldset className="svm-pricing-options">
            <legend>Pricing type · required</legend>
            {(['FREE', 'FIXED', 'NEGOTIABLE'] as const).map((value) => (
              <label key={value} className={draft.pricingType === value ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="service-pricing"
                  value={value}
                  checked={draft.pricingType === value}
                  onChange={() =>
                    setDraft((current) => ({ ...current, pricingType: value, price: '' }))
                  }
                />
                <span>
                  {value === 'FREE' ? 'Free' : value === 'FIXED' ? 'Fixed price' : 'Negotiable'}
                </span>
              </label>
            ))}
          </fieldset>
          {draft.pricingType === 'FIXED' ? (
            <label className="svm-field svm-fixed-price" htmlFor="offer-price">
              Listed amount · INR
              <input
                id="offer-price"
                className="cc-field"
                inputMode="decimal"
                required
                value={draft.price}
                maxLength={20}
                onChange={(event) => set('price', event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, price: true }))}
                aria-invalid={!!show('price')}
                aria-describedby={show('price') ? 'offer-price-error' : 'offer-price-help'}
              />
              <span id="offer-price-help" className="svm-help">
                A positive amount up to ₹1,00,00,000, with up to two decimals. This is the listed
                amount, not an hourly rate.
              </span>
              {show('price') ? (
                <span id="offer-price-error" className="svm-error">
                  {show('price')}
                </span>
              ) : null}
            </label>
          ) : (
            <p className="svm-help">
              {draft.pricingType === 'FREE'
                ? 'Offered without a listed charge.'
                : 'Scope and price can be discussed after a request is accepted. No fixed amount is listed.'}
            </p>
          )}
          <div className="svm-skills">
            <label htmlFor="offer-skill">
              Relevant skills <span>{draft.skills.length}/12 selected</span>
            </label>
            <div className="svm-skill-input">
              <input
                id="offer-skill"
                className="cc-field"
                value={skill}
                maxLength={51}
                placeholder="Add a skill"
                onChange={(event) => {
                  setSkill(event.target.value);
                  setSkillError(null);
                }}
                aria-invalid={!!skillError || !!show('skills')}
                aria-describedby="offer-skill-help"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    add();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={add}>
                Add skill
              </Button>
            </div>
            <p id="offer-skill-help" className="svm-help">
              Press Enter or Add skill. Up to 12 unique skills, 50 characters each.
            </p>
            {skillError || show('skills') ? (
              <p className="svm-error" role="alert">
                {skillError ?? show('skills')}
              </p>
            ) : null}
            <ul aria-label="Selected skills" className="svm-skill-chips">
              {draft.skills.map((value) => (
                <li key={value}>
                  <span>{value}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${value}`}
                    onClick={() =>
                      set(
                        'skills',
                        draft.skills.filter((item) => item !== value),
                      )
                    }
                  >
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="svm-form-section" aria-labelledby="offer-visibility">
          <div className="svm-section-heading">
            <span aria-hidden="true">03</span>
            <div>
              <h2 id="offer-visibility">Location &amp; visibility</h2>
              <p>Share a useful location and choose public featuring.</p>
            </div>
          </div>
          {field('location', 'Location · optional', 180)}
          <ServiceFeaturedConsent
            value={draft.featuredOnLanding}
            onChange={(value) => set('featuredOnLanding', value)}
            disabled={saving}
            eligible={!service || service.status === 'ACTIVE'}
          />
        </section>
      </fieldset>
      <footer className="svm-form-footer">
        <p>
          {saving
            ? 'Saving your service…'
            : unchanged
              ? 'No changes to save.'
              : service
                ? 'Existing requests and conversations are preserved.'
                : 'Review your details before publishing.'}
        </p>
        <div>
          <Link
            aria-disabled={saving || undefined}
            onClick={(event) => {
              if (saving) event.preventDefault();
            }}
            to={service ? `/services/${service.id}` : '/services'}
            className="cc-button cc-button--secondary"
          >
            Cancel
          </Link>
          <Button type="submit" loading={saving} disabled={saving || unchanged}>
            {saving ? 'Saving…' : service ? 'Save changes' : 'Publish service'}
          </Button>
        </div>
      </footer>
    </form>
  );
}

export function ServiceCreatePage() {
  const navigate = useNavigate();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <div className="cc-page svm-page svm-form-page">
      <Link className="svm-back" to="/services">
        <Icon name="arrow" />
        Back to Campus Services
      </Link>
      <header className="svm-header">
        <div>
          <h1>Offer a service</h1>
          <p>Share what you can help with and let students across campus find you.</p>
        </div>
      </header>
      <ServiceOfferForm
        initial={emptyServiceDraft}
        onSave={async (draft) => {
          const result = await servicesApi.create(draft);
          if (alive.current)
            void navigate(`/services/${result.id}`, { state: { serviceSaved: true } });
        }}
      />
    </div>
  );
}
export function ServiceEditPage({ id }: { readonly id: string }) {
  const navigate = useNavigate(),
    alive = useRef(true);
  const [record, setRecord] = useState<{
      service: StudentService | null;
      issue: string | null;
      status?: number;
    } | null>(null),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    if (!validServiceDetailId(id)) return () => controller.abort();
    void servicesApi
      .get(id, controller.signal)
      .then((service) => {
        if (current) setRecord({ service, issue: null });
      })
      .catch((reason: unknown) => {
        if (current && !controller.signal.aborted)
          setRecord({
            service: null,
            issue:
              reason instanceof ApiClientError
                ? reason.message
                : 'Check your connection and try again.',
            status: reason instanceof ApiClientError ? reason.status : 503,
          });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [id, attempt]);
  let blocked: string | null = null;
  if (!validServiceDetailId(id)) blocked = 'This service link is invalid.';
  else if (record?.issue)
    blocked =
      record.status === 404 ? 'This service is unavailable or no longer accessible.' : record.issue;
  else if (record?.service && !record.service.viewerIsProvider)
    blocked = 'Only the provider can edit this service.';
  else if (record?.service?.status === 'ARCHIVED')
    blocked = 'Archived services cannot be edited or reactivated.';
  else if (record?.service && typeof record.service.featuredOnLanding !== 'boolean')
    blocked =
      'This owner response is missing the Featured Posts consent value. Editing is disabled to avoid changing your consent unintentionally.';
  const service = record?.service;
  return (
    <div className="cc-page svm-page svm-form-page">
      <Link className="svm-back" to={validServiceDetailId(id) ? `/services/${id}` : '/services'}>
        <Icon name="arrow" />
        Back to service
      </Link>
      <header className="svm-header">
        <div>
          <h1>Edit service</h1>
          <p>
            Update your service details while keeping existing requests and conversations intact.
          </p>
        </div>
      </header>
      {blocked ? (
        <section className="svm-state" role="alert">
          <h2>Service is not editable</h2>
          <p>{blocked}</p>
          {record?.issue && record.status !== 403 && record.status !== 404 ? (
            <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </Button>
          ) : null}
          <Link className="cc-button cc-button--secondary" to="/services/saved">
            My Services &amp; Requests
          </Link>
        </section>
      ) : !service ? (
        <div className="svm-skeleton" role="status">
          Loading service…
        </div>
      ) : (
        <ServiceOfferForm
          key={service.id}
          initial={serviceDraftFrom(service)}
          service={service}
          onSave={async (draft) => {
            const patch = changedServiceFields(serviceDraftFrom(service), draft);
            if (!Object.keys(patch).length) return;
            const result = await servicesApi.update(id, patch);
            if (alive.current)
              void navigate(`/services/${result.id}`, { state: { serviceSaved: true } });
          }}
        />
      )}
    </div>
  );
}
