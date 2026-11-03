import type {
  DemoActivity,
  DemoConversation,
  DemoMetric,
  DemoNotification,
  DemoProject,
  DemoService,
} from './demo.types';

const projects: readonly DemoProject[] = [
  {
    compatibility: 94,
    description: 'Build an accessible campus navigation app with indoor wayfinding.',
    id: 'project-1',
    members: 3,
    skills: ['React', 'Maps', 'UI/UX'],
    status: 'Recruiting',
    title: 'Campus Navigator',
  },
  {
    compatibility: 87,
    description: 'Forecast cafeteria demand to reduce food waste.',
    id: 'project-2',
    members: 4,
    skills: ['Python', 'ML', 'Analytics'],
    status: 'Recruiting',
    title: 'Smart Canteen Forecasting',
  },
  {
    compatibility: 81,
    description: 'Open-source attendance insights for student study planning.',
    id: 'project-3',
    members: 5,
    skills: ['Node.js', 'PostgreSQL'],
    status: 'Active',
    title: 'StudyPulse',
  },
];

const services: readonly DemoService[] = [
  {
    category: 'Tutoring',
    id: 'service-1',
    price: '₹350 / hour',
    provider: 'Ananya Rao',
    rating: 4.9,
    title: 'Data Structures tutoring',
  },
  {
    category: 'Design',
    id: 'service-2',
    price: 'From ₹700',
    provider: 'Kabir Mehta',
    rating: 4.8,
    title: 'Presentation and poster design',
  },
  {
    category: 'Development',
    id: 'service-3',
    price: '₹500 / hour',
    provider: 'Riya Sen',
    rating: 4.7,
    title: 'React project mentoring',
  },
  {
    category: 'Photography',
    id: 'service-4',
    price: 'From ₹1,200',
    provider: 'Arjun Pillai',
    rating: 4.9,
    title: 'Campus event photography',
  },
];

const notifications: readonly DemoNotification[] = [
  {
    id: 'notification-1',
    message: 'A found item is a 92% match for your lost earbuds report.',
    read: false,
    time: '8 min ago',
    title: 'Strong Lost & Found match',
    type: 'system',
  },
  {
    id: 'notification-2',
    message: 'Aarav sent a message about your scientific calculator.',
    read: false,
    time: '24 min ago',
    title: 'New marketplace message',
    type: 'message',
  },
  {
    id: 'notification-3',
    message: 'Your application to Campus Navigator was shortlisted.',
    read: false,
    time: '2 hr ago',
    title: 'TeamUp application update',
    type: 'project',
  },
  {
    id: 'notification-4',
    message: 'Your Marketplace listing received 18 views this week.',
    read: true,
    time: 'Yesterday',
    title: 'Listing activity',
    type: 'marketplace',
  },
];

const conversations: readonly DemoConversation[] = [
  {
    context: 'Marketplace · Scientific calculator',
    id: 'conversation-1',
    lastMessage: 'Can I collect it after the 2 PM lecture?',
    name: 'Aarav Sharma',
    time: '10:42 AM',
    unread: 2,
  },
  {
    context: 'TeamUp · Campus Navigator',
    id: 'conversation-2',
    lastMessage: 'I shared the Figma flow in our drive.',
    name: 'Campus Navigator Team',
    time: 'Yesterday',
    unread: 0,
  },
  {
    context: 'Services · DSA tutoring',
    id: 'conversation-3',
    lastMessage: 'Saturday morning works for me.',
    name: 'Ananya Rao',
    time: 'Mon',
    unread: 0,
  },
];

const activities: readonly DemoActivity[] = [
  {
    id: 'a1',
    label: 'Your calculator listing received a new bookmark',
    meta: 'Marketplace',
    time: '12 min ago',
    type: 'listing',
  },
  {
    id: 'a2',
    label: 'New 92% match found for Wireless earbuds',
    meta: 'Lost & Found',
    time: '31 min ago',
    type: 'lost-found',
  },
  {
    id: 'a3',
    label: 'Campus Navigator reviewed your application',
    meta: 'TeamUp',
    time: '2 hr ago',
    type: 'project',
  },
  {
    id: 'a4',
    label: 'Your tutoring session is scheduled',
    meta: 'Services',
    time: 'Yesterday',
    type: 'service',
  },
];

const metrics: readonly DemoMetric[] = [
  { change: '+12% this month', label: 'Active students', value: '1,284' },
  { change: '+38 this week', label: 'Live listings', value: '326' },
  { change: '68% recovery rate', label: 'Lost items matched', value: '94' },
  { change: 'Across all modules', label: 'Monthly interactions', value: '8.6K' },
];

export const demoRepository = Object.freeze({
  getActivities: (): readonly DemoActivity[] => activities,
  getConversations: (): readonly DemoConversation[] => conversations,
  getMetrics: (): readonly DemoMetric[] => metrics,
  getNotifications: (): readonly DemoNotification[] => notifications,
  getProjects: (): readonly DemoProject[] => projects,
  getServices: (): readonly DemoService[] => services,
});
