import type { IconName } from '../components/Icon';

export interface NavItem {
  readonly icon: IconName;
  readonly label: string;
  readonly path: string;
}

export const primaryNavigation: readonly NavItem[] = [
  { icon: 'home', label: 'Home', path: '/home' },
  { icon: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { icon: 'store', label: 'Marketplace', path: '/marketplace' },
  { icon: 'search', label: 'Lost & Found', path: '/lost-found' },
  { icon: 'team', label: 'TeamUp', path: '/teamup' },
  { icon: 'briefcase', label: 'Services', path: '/services' },
];

export const workspaceNavigation: readonly NavItem[] = [
  { icon: 'ai', label: 'Campus Assistant', path: '/assistant' },
  { icon: 'message', label: 'Messages', path: '/messages' },
  { icon: 'bell', label: 'Notifications', path: '/notifications' },
  { icon: 'profile', label: 'My Profile', path: '/profile' },
  { icon: 'settings', label: 'Settings', path: '/settings' },
];

// Kept as a stable derived export for page-level navigation tests and consumers.
export const navigationGroups: ReadonlyArray<{
  readonly label: string;
  readonly items: readonly NavItem[];
}> = [
  {
    label: 'Home',
    items: [
      { icon: 'home', label: 'Home', path: '/home' },
      { icon: 'dashboard', label: 'Dashboard', path: '/dashboard' },
    ],
  },
  {
    label: 'Explore',
    items: [
      { icon: 'store', label: 'Marketplace', path: '/marketplace' },
      { icon: 'search', label: 'Lost & Found', path: '/lost-found' },
      { icon: 'team', label: 'TeamUp', path: '/teamup' },
      { icon: 'briefcase', label: 'Services', path: '/services' },
      { icon: 'search', label: 'Search', path: '/search' },
      { icon: 'ai', label: 'Campus Assistant', path: '/assistant' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { icon: 'message', label: 'Messages', path: '/messages' },
      { icon: 'bell', label: 'Notifications', path: '/notifications' },
    ],
  },
  {
    label: 'Account',
    items: [
      { icon: 'profile', label: 'Profile', path: '/profile' },
      { icon: 'settings', label: 'Settings', path: '/settings' },
    ],
  },
];

const titles: Readonly<Record<string, string>> = {
  '/admin': 'Administration',
  '/analytics': 'Analytics',
  '/assistant': 'Campus Assistant',
  '/dashboard': 'Dashboard',
  '/home': 'Home',
  '/lost-found': 'Lost & Found',
  '/marketplace': 'Marketplace',
  '/messages': 'Messages',
  '/moderation': 'Moderation',
  '/notifications': 'Notifications',
  '/profile': 'Profile',
  '/search': 'Search',
  '/services': 'Services',
  '/settings': 'Settings',
  '/teamup': 'TeamUp',
};

const contexts: Readonly<Record<string, string>> = {
  '/admin': 'Platform management',
  '/assistant': 'Grounded campus help',
  '/dashboard': 'Your activity and insights',
  '/home': 'Your CampusConnect home',
  '/lost-found': 'Reports, claims, and possible matches',
  '/marketplace': 'Campus listings and saved items',
  '/messages': 'Private campus conversations',
  '/moderation': 'Authorized safety workspace',
  '/notifications': 'Updates from across CampusConnect',
  '/profile': 'Your student identity',
  '/search': 'Discover campus people and opportunities',
  '/services': 'Student services and requests',
  '/settings': 'Account, security, and appearance',
  '/teamup': 'Projects, applications, and teams',
};

export const routeMatches = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`);

export const pageTitleForPath = (pathname: string) =>
  Object.entries(titles).find(([path]) => routeMatches(pathname, path))?.[1] ?? 'CampusConnect';

export const pageContextForPath = (pathname: string) =>
  Object.entries(contexts).find(([path]) => routeMatches(pathname, path))?.[1] ??
  'CampusConnect workspace';

export const mobilePrimary: readonly NavItem[] = [
  { icon: 'home', label: 'Home', path: '/home' },
  { icon: 'store', label: 'Marketplace', path: '/marketplace' },
  { icon: 'search', label: 'Search', path: '/search' },
  { icon: 'ai', label: 'Assistant', path: '/assistant' },
  { icon: 'message', label: 'Messages', path: '/messages' },
  { icon: 'profile', label: 'Profile', path: '/profile' },
];
