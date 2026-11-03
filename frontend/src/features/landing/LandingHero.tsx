import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { ProductPreview } from './ProductPreview';
import type { LandingHighlight } from './landing-highlights';

export function LandingHero({
  highlights,
  loading,
}: {
  readonly highlights: readonly LandingHighlight[];
  readonly loading: boolean;
}) {
  return (
    <section className="cc-landing-hero cc-chapter cc-chapter--intro" id="main-content">
      <div className="cc-landing-hero-copy">
        <p className="cc-landing-eyebrow">One connected campus workspace</p>
        <h1>Everything student life needs, finally connected.</h1>
        <p className="cc-landing-lead">
          Buy and sell within your campus community, recover lost items, find teammates, offer
          services, and get grounded help—all from one organized student platform.
        </p>
        <div className="cc-landing-hero-actions">
          <Link className="cc-landing-button cc-landing-button--primary" to="/register">
            Create your account <Icon name="arrow" />
          </Link>
          <a className="cc-landing-button cc-landing-button--secondary" href="#product">
            Explore the product
          </a>
        </div>
        <p className="cc-landing-assurance">
          <span>Authenticated access</span>
          <span>Privacy-conscious workflows</span>
          <span>Built around real student tasks</span>
        </p>
      </div>
      <div className="cc-hero-canvas-wrap">
        <ProductPreview highlights={highlights} loading={loading} />
      </div>
    </section>
  );
}
