import type { HttpClient } from '../client.js';

/**
 * Team resource — members, invitations, role changes. The server enforces plan
 * seat caps: POST /v1/team/members/invite returns HTTP 409 with a message
 * starting "Team limit reached" (publicApi.ts:2822-2823) when the workspace is
 * at its seat cap. The HttpClient maps that 409 to TeamSeatLimitError so callers
 * can branch on `instanceof TeamSeatLimitError` (other 409s on this endpoint —
 * "already a team member" / "invitation already pending" — stay ConflictError).
 *
 * STAGE 1 SCAFFOLD: method bodies are added by the per-resource agent next stage.
 * Types are ready in ../types.ts: TeamMember, TeamMemberListParams, ListMembersResult,
 * TeamInviteParams, TeamInviteResult, TeamRole, SetTeamRole, SetTeamRoleResult.
 */
export class Team {
  // Held for the next-stage resource methods (members / invite / set-role).
  constructor(protected readonly _client: HttpClient) {}
}
