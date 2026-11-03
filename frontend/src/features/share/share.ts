import { frontendEnv } from '../../config/env';

export type ShareModule = 'LOST_FOUND' | 'MARKETPLACE' | 'SERVICE' | 'TEAMUP';

interface BaseShareRecord {
  readonly description: string;
  readonly id: string;
  readonly publicContactEmail?: string | null;
  readonly title: string;
}

export type ShareRecord =
  | (BaseShareRecord & {
      readonly category: string;
      readonly location: string | null;
      readonly module: 'MARKETPLACE';
      readonly price: string;
      readonly status: string;
    })
  | (BaseShareRecord & {
      readonly category: string | null;
      readonly location: string | null;
      readonly module: 'LOST_FOUND';
      readonly status: string;
      readonly type: 'FOUND' | 'LOST';
    })
  | (BaseShareRecord & {
      readonly category: string | null;
      readonly module: 'TEAMUP';
      readonly skills: readonly string[];
      readonly status: string;
    })
  | (BaseShareRecord & {
      readonly category: string;
      readonly location: string | null;
      readonly module: 'SERVICE';
      readonly price: string;
      readonly skills: readonly string[];
      readonly status: string;
    });

const routeByModule: Readonly<Record<ShareModule, string>> = {
  LOST_FOUND: 'lost-found',
  MARKETPLACE: 'marketplace',
  SERVICE: 'services',
  TEAMUP: 'teamup',
};
const separator = '━━━━━━━━━━━━━━━━━━';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const cleanText = (value: string, maximum = 180): string => {
  const withoutDemoMarker = value.replace(/\s*\[campusconnect-examiner-demo-v1\]\s*/giu, ' ');
  const normalized = withoutDemoMarker.replace(/\s+/gu, ' ').trim();
  return normalized.length <= maximum
    ? normalized
    : `${normalized.slice(0, maximum - 1).trimEnd()}…`;
};
const readable = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
const publicContact = (record: ShareRecord, noun: string): string => {
  const email = record.publicContactEmail?.trim();
  return email && emailPattern.test(email)
    ? `📩 *Contact ${noun}:*\n${email}`
    : `📩 *Contact ${noun}:*\nUse CampusConnect messaging to respond safely.`;
};

export const canonicalRecordUrl = (record: Pick<ShareRecord, 'id' | 'module'>): string => {
  const runtimeOrigin = typeof window === 'undefined' ? undefined : window.location.origin;
  const origin = frontendEnv.publicAppUrl ?? runtimeOrigin;
  if (origin === undefined) throw new Error('A public CampusConnect origin is required.');
  return new URL(
    `/${routeByModule[record.module]}/${encodeURIComponent(record.id)}`,
    origin,
  ).toString();
};

const marketplaceMessage = (record: Extract<ShareRecord, { module: 'MARKETPLACE' }>) =>
  [
    '🎓 *CAMPUSCONNECT | MARKETPLACE*',
    separator,
    '',
    `🛍️ *${cleanText(record.title)}*`,
    '',
    cleanText(record.description),
    '',
    `💰 *Price:* ${record.price}`,
    `📂 *Category:* ${cleanText(record.category, 80)}`,
    ...(record.location ? [`📍 *Location:* ${cleanText(record.location, 100)}`] : []),
    `📌 *Status:* ${readable(record.status)}`,
    '',
    publicContact(record, 'Seller'),
    '',
    separator,
    '🤝 *Interested?* Contact the seller through CampusConnect.',
    '',
    '*CampusConnect — Connect. Collaborate. Grow.*',
  ].join('\n');

const lostFoundMessage = (record: Extract<ShareRecord, { module: 'LOST_FOUND' }>) =>
  [
    '🎓 *CAMPUSCONNECT | LOST & FOUND*',
    separator,
    '',
    `${record.type === 'LOST' ? '🔎' : '✅'} *${record.type}: ${cleanText(record.title)}*`,
    '',
    cleanText(record.description),
    '',
    ...(record.category ? [`📂 *Category:* ${cleanText(record.category, 80)}`] : []),
    ...(record.location ? [`📍 *General Location:* ${cleanText(record.location, 100)}`] : []),
    `📌 *Status:* ${readable(record.status)}`,
    '',
    '🔐 Respond through CampusConnect so claim details remain private.',
    '',
    separator,
    '🤝 *Can you help?* Open CampusConnect and view the public report.',
    '',
    '*CampusConnect — Connect. Collaborate. Grow.*',
  ].join('\n');

const teamUpMessage = (record: Extract<ShareRecord, { module: 'TEAMUP' }>) =>
  [
    '🎓 *CAMPUSCONNECT | TEAMUP*',
    separator,
    '',
    `🚀 *${cleanText(record.title)}*`,
    '',
    cleanText(record.description),
    '',
    ...(record.category ? [`📂 *Category:* ${cleanText(record.category, 80)}`] : []),
    ...(record.skills.length
      ? [
          `🛠️ *Skills Needed:* ${record.skills
            .slice(0, 8)
            .map((skill) => cleanText(skill, 50))
            .join(', ')}`,
        ]
      : []),
    `📌 *Status:* ${readable(record.status)}`,
    '',
    publicContact(record, 'Project Owner'),
    '',
    separator,
    '🤝 *Interested?* Contact the project owner to collaborate.',
    '',
    '*CampusConnect — Connect. Collaborate. Grow.*',
  ].join('\n');

const serviceMessage = (record: Extract<ShareRecord, { module: 'SERVICE' }>) =>
  [
    '🎓 *CAMPUSCONNECT | STUDENT SERVICES*',
    separator,
    '',
    `🧰 *${cleanText(record.title)}*`,
    '',
    cleanText(record.description),
    '',
    `📂 *Category:* ${cleanText(record.category, 80)}`,
    `💰 *Pricing:* ${record.price}`,
    ...(record.location ? [`📍 *Location:* ${cleanText(record.location, 100)}`] : []),
    ...(record.skills.length
      ? [
          `🛠️ *Skills:* ${record.skills
            .slice(0, 8)
            .map((skill) => cleanText(skill, 50))
            .join(', ')}`,
        ]
      : []),
    `📌 *Status:* ${readable(record.status)}`,
    '',
    publicContact(record, 'Provider'),
    '',
    separator,
    '🤝 *Interested?* Request the service through CampusConnect.',
    '',
    '*CampusConnect — Connect. Collaborate. Grow.*',
  ].join('\n');

export const formatShareMessage = (record: ShareRecord): string => {
  if (record.module === 'MARKETPLACE') return marketplaceMessage(record);
  if (record.module === 'LOST_FOUND') return lostFoundMessage(record);
  if (record.module === 'TEAMUP') return teamUpMessage(record);
  return serviceMessage(record);
};

export const whatsappShareUrl = (message: string): string =>
  `https://wa.me/?text=${encodeURIComponent(message)}`;
