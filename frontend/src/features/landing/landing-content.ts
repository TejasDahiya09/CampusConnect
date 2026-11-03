import type { IconName } from '../../components/Icon';

export interface PlatformModule {
  readonly accent: 'cyan' | 'indigo' | 'lavender';
  readonly capabilities: readonly string[];
  readonly description: string;
  readonly icon: IconName;
  readonly id: 'assistant' | 'lost-found' | 'marketplace' | 'services' | 'teamup';
  readonly title: string;
}

export const platformModules: readonly PlatformModule[] = [
  {
    accent: 'indigo',
    capabilities: [
      'Search and filter listings',
      'Save items for later',
      'Message sellers directly',
    ],
    description: 'Buy and sell useful items within your student community.',
    icon: 'store',
    id: 'marketplace',
    title: 'Marketplace',
  },
  {
    accent: 'cyan',
    capabilities: [
      'Create structured reports',
      'Manage privacy-conscious claims',
      'Review explainable match suggestions',
    ],
    description: 'Report missing or found items and review relevant matches.',
    icon: 'search',
    id: 'lost-found',
    title: 'Lost & Found',
  },
  {
    accent: 'lavender',
    capabilities: [
      'Discover open projects',
      'Apply through clear workflows',
      'Find relevant student skills',
    ],
    description: 'Turn ideas into projects with the right student collaborators.',
    icon: 'team',
    id: 'teamup',
    title: 'TeamUp',
  },
  {
    accent: 'cyan',
    capabilities: ['Browse by category', 'Request a student service', 'Manage provider workflows'],
    description: 'Discover practical services offered by fellow students.',
    icon: 'briefcase',
    id: 'services',
    title: 'Services',
  },
  {
    accent: 'indigo',
    capabilities: [
      'Ask grounded questions',
      'Review visible source citations',
      'Receive clear unavailable states',
    ],
    description: 'Ask questions across authorized CampusConnect information.',
    icon: 'ai',
    id: 'assistant',
    title: 'Campus Assistant',
  },
] as const;

export const journeySteps = [
  {
    description: 'Add the skills, interests, links, and information you choose to share.',
    icon: 'profile' as const,
    number: '01',
    title: 'Set up your student profile',
  },
  {
    description: 'Browse listings, reports, projects, services, and authorized campus information.',
    icon: 'search' as const,
    number: '02',
    title: 'Find what matters right now',
  },
  {
    description: 'Save, message, apply, report, claim, or contribute through organized workflows.',
    icon: 'arrow' as const,
    number: '03',
    title: 'Take the next step',
  },
] as const;

export const trustItems = [
  {
    description:
      'Marketplace, Lost & Found, TeamUp, Services, and campus help are organized around everyday student tasks.',
    icon: 'sparkles' as const,
    title: 'Student-focused by design',
  },
  {
    description:
      'Public views use limited profile information, while sensitive actions stay behind authenticated and authorized flows.',
    icon: 'shield' as const,
    title: 'Privacy-conscious workflows',
  },
  {
    description:
      'Content management and private actions are controlled by authenticated ownership and role checks.',
    icon: 'profile' as const,
    title: 'Clear roles and ownership',
  },
  {
    description:
      'AI-assisted experiences use explanations, citations, and honest unavailable states when evidence is insufficient.',
    icon: 'ai' as const,
    title: 'Honest AI support',
  },
] as const;
