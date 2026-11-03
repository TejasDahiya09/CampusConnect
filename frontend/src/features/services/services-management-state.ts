import type { ServiceDraft, ServiceRequest, ServiceStatus, StudentService } from './services.types';

export const emptyServiceDraft: ServiceDraft = {
  title: '',
  category: '',
  description: '',
  pricingType: 'FREE',
  price: '',
  skills: [],
  location: '',
  featuredOnLanding: false,
};
export const serviceDraftFrom = (service: StudentService): ServiceDraft => ({
  title: service.title,
  category: service.category,
  description: service.description,
  pricingType: service.pricingType,
  price: service.price ?? '',
  skills: [...service.skills],
  location: service.location ?? '',
  featuredOnLanding: service.featuredOnLanding === true,
});
export function addServiceSkill(
  skills: readonly string[],
  input: string,
): { skills: readonly string[]; error: string | null } {
  const skill = input.trim();
  const error = !skill
    ? 'Enter a skill first.'
    : skill.length > 50
      ? 'Use up to 50 characters per skill.'
      : skills.some((value) => value.toLowerCase() === skill.toLowerCase())
        ? 'This skill is already selected.'
        : skills.length >= 12
          ? 'You can select up to 12 skills.'
          : null;
  return { skills: error ? skills : [...skills, skill], error };
}
export function validateServiceDraft(
  draft: ServiceDraft,
): Partial<Record<keyof ServiceDraft, string>> {
  const errors: Partial<Record<keyof ServiceDraft, string>> = {};
  for (const [key, min, max] of [
    ['title', 3, 180],
    ['category', 2, 100],
    ['description', 20, 5000],
  ] as const) {
    if (draft[key].trim().length < min || draft[key].trim().length > max)
      errors[key] = `Use between ${min} and ${max.toLocaleString('en-IN')} characters.`;
  }
  if (!['FREE', 'FIXED', 'NEGOTIABLE'].includes(draft.pricingType))
    errors.pricingType = 'Choose a supported pricing type.';
  if (
    draft.pricingType === 'FIXED' &&
    (!/^\d+(\.\d{1,2})?$/.test(draft.price) ||
      Number(draft.price) <= 0 ||
      Number(draft.price) > 10_000_000)
  )
    errors.price = 'Use a positive amount up to ₹1,00,00,000 with at most two decimals.';
  if (draft.location.trim().length > 180) errors.location = 'Use up to 180 characters.';
  if (
    draft.skills.length > 12 ||
    draft.skills.some((skill) => !skill.trim() || skill.trim().length > 50) ||
    new Set(draft.skills.map((skill) => skill.trim().toLowerCase())).size !== draft.skills.length
  )
    errors.skills = 'Choose up to 12 unique skills, each up to 50 characters.';
  if (typeof draft.featuredOnLanding !== 'boolean')
    errors.featuredOnLanding = 'Choose whether to allow public featuring.';
  return errors;
}
export const normalizeServiceDraft = (draft: ServiceDraft): ServiceDraft => ({
  title: draft.title.trim(),
  category: draft.category.trim(),
  description: draft.description.trim(),
  location: draft.location.trim(),
  pricingType: draft.pricingType,
  price: draft.pricingType === 'FREE' ? '0' : draft.pricingType === 'NEGOTIABLE' ? '' : draft.price,
  skills: draft.skills.map((skill) => skill.trim()),
  featuredOnLanding: draft.featuredOnLanding,
});
export function changedServiceFields(
  initial: ServiceDraft,
  draft: ServiceDraft,
): Partial<ServiceDraft> {
  const before = normalizeServiceDraft(initial),
    after = normalizeServiceDraft(draft);
  const result: Partial<{ -readonly [K in keyof ServiceDraft]: ServiceDraft[K] }> = {};
  for (const key of [
    'title',
    'category',
    'description',
    'location',
    'featuredOnLanding',
    'skills',
  ] as const) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      Object.assign(result, { [key]: after[key] });
  }
  if (
    before.pricingType !== after.pricingType ||
    (after.pricingType === 'FIXED' && Number(before.price) !== Number(after.price))
  ) {
    result.pricingType = after.pricingType;
    result.price = after.price;
  }
  return result;
}
export const lifecycleTargets = (service: StudentService): readonly ServiceStatus[] =>
  !service.viewerIsProvider
    ? []
    : service.status === 'ACTIVE'
      ? ['PAUSED', 'ARCHIVED']
      : service.status === 'PAUSED'
        ? ['ACTIVE', 'ARCHIVED']
        : [];
export const canReviewServiceRequest = (
  request: ServiceRequest,
  action: 'ACCEPTED' | 'REJECTED' | 'COMPLETED',
) =>
  Boolean(
    request.service?.viewerIsProvider &&
    (action === 'COMPLETED'
      ? request.status === 'ACCEPTED'
      : request.status === 'PENDING' &&
        (action === 'REJECTED' || request.service.status === 'ACTIVE')),
  );
export const serviceConversationInput = (request: ServiceRequest, received: boolean) =>
  request.service &&
  ['ACCEPTED', 'COMPLETED'].includes(request.status) &&
  request.service.viewerIsProvider === received
    ? {
        contextType: 'SERVICE' as const,
        contextId: request.id,
        targetUserId: received ? request.requesterId : request.service.providerId,
      }
    : null;
