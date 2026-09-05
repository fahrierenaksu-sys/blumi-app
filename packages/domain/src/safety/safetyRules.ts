import type {
  BlockUserCommand,
  ReportReason,
  ReportUserCommand,
} from "@blumi/contracts";

export interface BlockRecord {
  actorUserId: string;
  blockedUserId: string;
}

export function applyBlock(
  blocks: readonly BlockRecord[],
  command: BlockUserCommand
): BlockRecord[] {
  if (command.actorUserId === command.blockedUserId) {
    return [...blocks];
  }

  const alreadyBlocked = blocks.some(
    (block) =>
      block.actorUserId === command.actorUserId &&
      block.blockedUserId === command.blockedUserId
  );

  if (alreadyBlocked) {
    return [...blocks];
  }

  return [
    ...blocks,
    {
      actorUserId: command.actorUserId,
      blockedUserId: command.blockedUserId,
    },
  ];
}

export function isInteractionBlocked(
  blocks: readonly BlockRecord[],
  actorUserId: string,
  otherUserId: string
): boolean {
  return blocks.some(
    (block) =>
      (block.actorUserId === actorUserId && block.blockedUserId === otherUserId) ||
      (block.actorUserId === otherUserId && block.blockedUserId === actorUserId)
  );
}

export function canReportUser(
  command: ReportUserCommand,
  allowedReasons: readonly ReportReason[]
): boolean {
  return (
    command.actorUserId !== command.reportedUserId &&
    allowedReasons.includes(command.reason)
  );
}
