import { LostFoundType } from '../../generated/prisma/client.js';
import { buildDemoSeedPlan } from '../demo-seed/demo-seed.data.js';
import { DEMO_MARKER } from '../demo-seed/demo-seed.types.js';

export interface LostFoundMatchTarget {
  readonly category: string;
  readonly description: string;
  readonly id: string;
  readonly imageCompatibility: 'COMPATIBLE' | 'INCOMPATIBLE';
  readonly incidentDate: Date;
  readonly location: string;
  readonly reporterId: string;
  readonly title: string;
  readonly type: LostFoundType;
}

const tagged = (description: string): string => `${description}\n\n${DEMO_MARKER}`;
const date = (value: string): Date => new Date(`${value}T12:00:00.000Z`);

export const buildLostFoundMatchTargets = (
  userIds: readonly [string, string, string],
): readonly LostFoundMatchTarget[] => {
  const source = buildDemoSeedPlan(userIds).lostFound;
  const targets = [
    {
      category: 'Books',
      description: tagged(
        'I misplaced a blue notebook containing handwritten Data Structures notes and algorithm diagrams after the DSA class in the Central Library.',
      ),
      imageCompatibility: 'INCOMPATIBLE',
      incidentDate: date('2026-10-06'),
      location: 'Central Library',
      title: 'Blue Data Structures Notebook',
      type: LostFoundType.LOST,
    },
    {
      category: 'Electronics',
      description: tagged(
        'Found a pair of Bluetooth earphones inside a small black charging case near the Student Centre seating area.',
      ),
      imageCompatibility: 'COMPATIBLE',
      incidentDate: date('2026-10-07'),
      location: 'Student Centre',
      title: 'Bluetooth Earphones with Black Charging Case',
      type: LostFoundType.FOUND,
    },
    {
      category: 'Electronics',
      description: tagged(
        'Lost my Casio FX-991ES Plus scientific calculator after an engineering tutorial. It has a dark grey cover and my initials inside the case.',
      ),
      imageCompatibility: 'COMPATIBLE',
      incidentDate: date('2026-10-05'),
      location: 'Engineering Block',
      title: 'Casio FX-991ES Plus Scientific Calculator',
      type: LostFoundType.LOST,
    },
    {
      category: 'Books',
      description: tagged(
        'A blue register filled with DSA class notes, linked-list sketches, and sorting examples was found on a Central Library desk.',
      ),
      imageCompatibility: 'COMPATIBLE',
      incidentDate: date('2026-10-06'),
      location: 'Central Library',
      title: 'Blue DSA Class Notes Register',
      type: LostFoundType.FOUND,
    },
    {
      category: 'Drinkware',
      description: tagged(
        'Found a blue stainless-steel water bottle beside the Sports Complex court. It has a silver screw cap and no visible name.',
      ),
      imageCompatibility: 'COMPATIBLE',
      incidentDate: date('2026-10-07'),
      location: 'Sports Complex',
      title: 'Blue Steel Water Bottle',
      type: LostFoundType.FOUND,
    },
    {
      category: 'Accessories',
      description: tagged(
        'Found a dark grey student laptop bag near the Student Centre. It has padded shoulder straps and a separate laptop compartment.',
      ),
      imageCompatibility: 'INCOMPATIBLE',
      incidentDate: date('2026-10-07'),
      location: 'Student Centre',
      title: 'Dark Grey Student Laptop Bag',
      type: LostFoundType.FOUND,
    },
    {
      category: 'Electronics',
      description: tagged(
        'I lost black wireless earbuds in their compact charging case while studying near the Student Centre. The case has a small scratch on its lid.',
      ),
      imageCompatibility: 'INCOMPATIBLE',
      incidentDate: date('2026-10-06'),
      location: 'Student Centre',
      title: 'Black Wireless Earbuds in Charging Case',
      type: LostFoundType.LOST,
    },
    {
      category: 'Electronics',
      description: tagged(
        'Found a Casio FX-991ES Plus scientific calculator with a dark grey protective cover in the Engineering Block seminar room.',
      ),
      imageCompatibility: 'INCOMPATIBLE',
      incidentDate: date('2026-10-05'),
      location: 'Engineering Block',
      title: 'Casio FX-991ES Plus Scientific Calculator',
      type: LostFoundType.FOUND,
    },
    {
      category: 'Accessories',
      description: tagged(
        'Lost a grey college backpack with padded laptop storage and two front pockets near the Student Centre entrance.',
      ),
      imageCompatibility: 'COMPATIBLE',
      incidentDate: date('2026-10-06'),
      location: 'Student Centre',
      title: 'Grey College Backpack',
      type: LostFoundType.LOST,
    },
  ] as const;

  return targets.map((target, index) => {
    const existing = source[index];
    if (!existing) throw new Error(`Missing deterministic Lost & Found demo record ${index}.`);
    return { ...target, id: existing.id, reporterId: existing.reporterId };
  });
};
