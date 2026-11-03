import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
const ServicesBrowse = lazy(() => import('./ServicesBrowse'));
export function ServicesPage() {
  return (
    <Suspense
      fallback={
        <div className="cc-page" role="status">
          Loading Campus Services?
        </div>
      }
    >
      <ServicesBrowse />
    </Suspense>
  );
}
export { ServiceRequestControls } from './ServiceDetailPanels';
const ServiceDetail = lazy(() => import('./ServiceDetail'));
export function ServiceDetailPage() {
  const { id = '' } = useParams();
  return (
    <Suspense
      fallback={
        <div className="cc-page" role="status">
          Loading service?
        </div>
      }
    >
      <ServiceDetail key={id} id={id} />
    </Suspense>
  );
}

const ServiceCreate = lazy(() =>
  import('./ServiceOfferForm').then((module) => ({ default: module.ServiceCreatePage })),
);
const ServiceEdit = lazy(() =>
  import('./ServiceOfferForm').then((module) => ({ default: module.ServiceEditPage })),
);
const Workspace = lazy(() => import('./ServicesWorkspace'));
export function ServiceCreatePage() {
  return (
    <Suspense
      fallback={
        <div className="cc-page" role="status">
          Loading service form?
        </div>
      }
    >
      <ServiceCreate />
    </Suspense>
  );
}
export function ServiceEditPage() {
  const { id = '' } = useParams();
  return (
    <Suspense
      fallback={
        <div className="cc-page" role="status">
          Loading service form?
        </div>
      }
    >
      <ServiceEdit key={id} id={id} />
    </Suspense>
  );
}
export function SavedServicesPage() {
  return (
    <Suspense
      fallback={
        <div className="cc-page" role="status">
          Loading your workspace?
        </div>
      }
    >
      <Workspace />
    </Suspense>
  );
}
