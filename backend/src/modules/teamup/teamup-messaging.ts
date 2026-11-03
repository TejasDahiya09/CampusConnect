import { AccountStatus, ModerationVisibility, type Prisma } from '../../generated/prisma/client.js';

/** New TeamUp conversations use current membership. Existing conversation history is preserved. */
export const canStartTeamUpConversation = async (
  db: Pick<Prisma.TransactionClient, 'teamUp' | 'user'>,
  actor: string,
  target: string,
  projectId: string,
): Promise<boolean> => {
  const project = await db.teamUp.findFirst({
    where: {
      id: projectId,
      moderationVisibility: ModerationVisibility.VISIBLE,
      owner: { status: AccountStatus.ACTIVE },
    },
    select: { members: true, ownerId: true },
  });
  if (!project || actor === target) return false;
  const participants = new Set([project.ownerId]);
  if (Array.isArray(project.members))
    for (const member of project.members) {
      if (
        typeof member === 'object' &&
        member !== null &&
        !Array.isArray(member) &&
        typeof member.userId === 'string'
      )
        participants.add(member.userId);
    }
  if (!participants.has(actor) || !participants.has(target)) return false;
  return (
    (await db.user.count({
      where: { id: { in: [actor, target] }, status: AccountStatus.ACTIVE },
    })) === 2
  );
};
