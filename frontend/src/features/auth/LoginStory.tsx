import { PublicBrand } from '../../components/PublicChrome';
import { LoginKineticRibbon } from './LoginKineticRibbon';

export function LoginStory({
  condensed = false,
  description = 'Ideas worth exploring. People worth meeting. Opportunities worth taking.',
  title = 'Your next move starts here.',
}: {
  readonly condensed?: boolean;
  readonly description?: string;
  readonly title?: string;
}) {
  return (
    <section aria-label="CampusConnect introduction" className="cc-login-story">
      <PublicBrand />
      <div className="cc-login-story-copy">
        <p className="cc-login-story-title">{title}</p>
        {!condensed ? <p>{description}</p> : null}
      </div>
      <LoginKineticRibbon />
    </section>
  );
}

export function SessionRestorationStatus() {
  return (
    <div aria-live="polite" className="cc-login-initializing" role="status">
      <span aria-hidden="true" className="cc-login-spinner" />
      <strong>Preparing your CampusConnect workspace</strong>
      <p>Restoring your secure session…</p>
    </div>
  );
}
