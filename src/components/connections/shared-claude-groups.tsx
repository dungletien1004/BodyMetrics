import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { originFromHeaders } from "@/lib/oauth/origin";
import { listGrants } from "@/lib/oauth/tokens";
import { SharedClaudeGroupsClient } from "./shared-claude-groups-client";

export async function SharedClaudeGroups() {
  const user = await requireUser();
  const [groups, grants, requestHeaders] = await Promise.all([
    db.mcpConnectionGroup.findMany({
      where: { members: { some: { userId: user.id } } },
      include: {
        owner: { select: { id: true, username: true, name: true } },
        members: {
          where: { user: { active: true } },
          orderBy: { joinedAt: "asc" },
          include: { user: { select: { id: true, username: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    listGrants(user.id),
    headers(),
  ]);

  return (
    <SharedClaudeGroupsClient
      userId={user.id}
      origin={originFromHeaders(requestHeaders)}
      groups={groups.map((group) => ({
        id: group.id,
        name: group.name,
        ownerUserId: group.ownerUserId,
        owner: group.owner,
        members: group.members.map((member) => member.user),
        connected: grants.some((grant) => grant.connectionGroupId === group.id),
      }))}
    />
  );
}
