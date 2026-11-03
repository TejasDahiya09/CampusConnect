import { createHash } from 'node:crypto';
import {
  ListingCondition,
  ListingStatus,
  LostFoundStatus,
  LostFoundType,
  ProjectStatus,
  ServiceStatus,
} from '../../generated/prisma/client.js';
import { marketplaceCategories } from '../../modules/marketplace/marketplace-categories.js';
import { DEMO_DATASET_ID, DEMO_MARKER, type DemoSeedPlan } from './demo-seed.types.js';

const deterministicUuid = (key: string): string => {
  const hex = createHash('sha256').update(`${DEMO_DATASET_ID}:${key}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
};
const tagged = (description: string): string => `${description}\n\n${DEMO_MARKER}`;
const date = (daysFromNow: number): Date => {
  const value = new Date('2026-10-08T12:00:00.000Z');
  value.setUTCDate(value.getUTCDate() + daysFromNow);
  return value;
};
const categoryName = (id: string): string => {
  const category = marketplaceCategories.find((item) => item.id === id);
  if (!category) throw new Error(`Unknown configured marketplace category: ${id}`);
  return category.name;
};

export const buildDemoSeedPlan = (userIds: readonly [string, string, string]): DemoSeedPlan => {
  const [userA, userB, userC] = userIds;
  const marketplaceItems = [
    ['Casio FX-991ES Plus Scientific Calculator', 'calculators', '850.00', ListingCondition.GOOD],
    [
      'Data Structures and Algorithms Textbook',
      'books-study-material',
      '450.00',
      ListingCondition.GOOD,
    ],
    ['Almost-New College Backpack', 'clothing-accessories', '1000.00', ListingCondition.LIKE_NEW],
    ['Wireless Mouse for Study Setup', 'electronics', '650.00', ListingCondition.GOOD],
    ['Mechanical Keyboard with Brown Switches', 'electronics', '1800.00', ListingCondition.GOOD],
    ['LED Hostel Study Lamp', 'hostel-essentials', '550.00', ListingCondition.LIKE_NEW],
    ['Single-Speed Campus Bicycle', 'cycles', '4200.00', ListingCondition.FAIR],
    ['Engineering Drawing Kit', 'lab-equipment', '700.00', ListingCondition.GOOD],
    ['Adjustable Aluminium Laptop Stand', 'electronics', '900.00', ListingCondition.LIKE_NEW],
    ['Bluetooth Over-Ear Headphones', 'electronics', '1400.00', ListingCondition.GOOD],
    ['24-inch Full HD Monitor', 'electronics', '5800.00', ListingCondition.GOOD],
    ['Bundle of Used Programming Books', 'books-study-material', '1200.00', ListingCondition.FAIR],
  ] as const;
  const owners = [
    userA,
    userA,
    userA,
    userA,
    userB,
    userB,
    userB,
    userB,
    userC,
    userC,
    userC,
    userC,
  ] as const;
  const marketplace = marketplaceItems.map(([title, category, price, condition], index) => ({
    bookmarks: index === 0 ? [userB, userC] : index === 4 ? [userA] : [],
    category: categoryName(category),
    condition,
    currency: 'INR' as const,
    description: tagged(
      `A clean, student-owned ${title.toLowerCase()} ready for an on-campus handover.`,
    ),
    id: deterministicUuid(`marketplace:${index}`),
    images: [] as const,
    location: ['Central Library', 'Main Academic Block', 'Student Centre'][index % 3] ?? 'Campus',
    price,
    sellerId: owners[index] ?? userA,
    status: ListingStatus.ACTIVE,
    title,
  }));

  const lostFoundItems = [
    [
      LostFoundType.LOST,
      'University ID Card in Blue Holder',
      'Identity card',
      'Central Library',
      -2,
    ],
    [LostFoundType.FOUND, 'Wireless Earbuds in Black Case', 'Electronics', 'Student Centre', -1],
    [LostFoundType.LOST, 'Casio Scientific Calculator', 'Electronics', 'Engineering Block', -3],
    [LostFoundType.FOUND, 'Blue Data Structures Notebook', 'Books', 'Central Library', -2],
    [LostFoundType.LOST, 'Blue Steel Water Bottle', 'Accessories', 'Sports Complex', -1],
    [LostFoundType.FOUND, 'Key Ring with Three Keys', 'Accessories', 'Hostel Canteen', -1],
    [LostFoundType.LOST, 'Black 32GB USB Drive', 'Electronics', 'Computer Lab', -4],
    [LostFoundType.FOUND, 'Black-Rimmed Spectacles', 'Accessories', 'Engineering Block', -3],
    [LostFoundType.LOST, 'Grey College Backpack', 'Accessories', 'Student Centre', -2],
  ] as const;
  const reporters = [userA, userA, userA, userB, userB, userB, userC, userC, userC] as const;
  const lostFound = lostFoundItems.map(([type, title, category, location, day], index) => ({
    bookmarks: index === 1 ? [userC] : index === 7 ? [userA] : [],
    category,
    claims: [] as const,
    description: tagged(
      `${type === LostFoundType.LOST ? 'Last seen' : 'Found'} near ${location}. Identifying details can be confirmed safely through the claim flow.`,
    ),
    id: deterministicUuid(`lost-found:${index}`),
    images: [] as const,
    incidentDate: date(day),
    location,
    matches: [] as const,
    reporterId: reporters[index] ?? userA,
    status: LostFoundStatus.OPEN,
    title,
    type,
  }));

  const teamItems = [
    ['AI-Powered Study Planner', 'AI & Machine Learning', ['Python', 'React', 'Machine Learning']],
    ['Campus Sustainability Application', 'Social Impact', ['TypeScript', 'UI/UX', 'Research']],
    ['Smart Attendance Analytics', 'Data Science', ['Python', 'Data Analysis', 'SQL']],
    ['College Hackathon Team', 'Hackathon', ['React', 'Node.js', 'Product Design']],
    ['Student Expense Tracker', 'Web Development', ['TypeScript', 'PostgreSQL', 'React']],
    ['Student Portfolio Builder', 'Web Development', ['React', 'CSS', 'UX Writing']],
    [
      'Computer Vision Mini-Project',
      'AI & Machine Learning',
      ['Python', 'OpenCV', 'Deep Learning'],
    ],
    ['Accessible Campus Navigation', 'Social Impact', ['Mobile Development', 'Maps', 'UI/UX']],
    ['Machine Learning Research Group', 'Research', ['Python', 'Statistics', 'Technical Writing']],
  ] as const;
  const teamOwners = [userA, userA, userA, userB, userB, userB, userC, userC, userC] as const;
  const teamUp = teamItems.map(([title, category, requiredSkills], index) => ({
    applications: [] as const,
    bookmarks: [] as const,
    category,
    deadline: date(30 + index * 3),
    description: tagged(
      `A collaborative student project seeking motivated teammates to build ${title.toLowerCase()}.`,
    ),
    id: deterministicUuid(`teamup:${index}`),
    images: [] as const,
    maxMembers: 4 + (index % 3),
    members: [] as const,
    ownerId: teamOwners[index] ?? userA,
    requiredSkills,
    status: ProjectStatus.OPEN,
    title,
  }));

  const serviceItems = [
    ['Python Programming Tutoring', 'Tutoring', ['Python', 'Problem Solving'], '500.00'],
    ['Resume and Portfolio Review', 'Career Support', ['Resume Writing', 'Portfolio'], '300.00'],
    ['Graphic Design for Student Clubs', 'Design', ['Canva', 'Graphic Design'], '700.00'],
    ['Video Editing for Presentations', 'Media', ['Video Editing', 'DaVinci Resolve'], '800.00'],
    ['Responsive Website Development', 'Technology', ['React', 'TypeScript'], null],
    ['Mathematics Tutoring', 'Tutoring', ['Calculus', 'Linear Algebra'], '400.00'],
    ['Presentation Design Support', 'Design', ['PowerPoint', 'Storytelling'], '350.00'],
    ['UI/UX Design Review', 'Design', ['Figma', 'UI/UX'], '600.00'],
    ['Data Analysis Assistance', 'Technology', ['Python', 'Excel', 'Statistics'], '750.00'],
  ] as const;
  const providers = [userA, userA, userA, userB, userB, userB, userC, userC, userC] as const;
  const services = serviceItems.map(([title, category, skills, price], index) => ({
    bookings: [] as const,
    bookmarks: index === 0 ? [userC] : index === 4 ? [userA] : [],
    category,
    currency: 'INR' as const,
    description: tagged(
      `Student-friendly ${title.toLowerCase()} with scope and schedule agreed before work begins.`,
    ),
    id: deterministicUuid(`service:${index}`),
    images: [] as const,
    location: index % 2 === 0 ? 'Campus or online' : 'Online',
    portfolio: [] as const,
    price,
    providerId: providers[index] ?? userA,
    reviews: [] as const,
    skills,
    status: ServiceStatus.ACTIVE,
    title,
  }));

  return { datasetId: DEMO_DATASET_ID, lostFound, marketplace, services, teamUp, userIds };
};
