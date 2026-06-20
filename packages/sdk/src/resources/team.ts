import type { HttpClient } from '../client.js';
import type {
  TeamMember,
  TeamMemberListParams,
  ListMembersResult,
  TeamInviteParams,
  TeamInviteResult,
  SetTeamRole,
  SetTeamRoleResult,
  RequestOptions,
} from '../types.js';

const enc = encodeURIComponent;

/**
 * Team resource — members, invitations, role changes. The server enforces plan
 * seat caps: POST /v1/team/members/invite returns HTTP 409 with a message
 * starting "Team limit reached" (publicApi.ts:2822-2823) when the workspace is
 * at its seat cap. The HttpClient maps that 409 to TeamSeatLimitError so callers
 * can branch on `instanceof TeamSeatLimitError` (other 409s on this endpoint —
 * "already a team member" / "invitation already pending" — stay ConflictError).
 *
 * The list (GET /v1/team/members) merges active members + pending invitations
 * into one paginated `{ data, total, limit, offset }` envelope.
 */
export class Team {
  constructor(private readonly _client: HttpClient) {}

  /** List members + pending invitations (merged, paginated). */
  listMembers(params?: TeamMemberListParams, opts?: RequestOptions): Promise<ListMembersResult> {
    return this._client.getPage<TeamMember>('/team/members', params as Record<string, string | number | boolean | undefined>, opts);
  }

  /**
   * Invite a member. Throws TeamSeatLimitError (409) when the workspace is at
   * its plan seat cap. The `accountant` role is seat-exempt server-side.
   */
  invite(params: TeamInviteParams, opts?: RequestOptions): Promise<TeamInviteResult> {
    return this._client.post('/team/members/invite', params, opts);
  }

  /** Change an active member's role (cannot target the workspace owner). */
  setRole(memberId: string, role: SetTeamRole, opts?: RequestOptions): Promise<SetTeamRoleResult> {
    return this._client.patch(`/team/members/${enc(memberId)}/role`, { role }, opts);
  }

  /** Remove an active member or revoke a pending invitation. */
  removeMember(memberId: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/team/members/${enc(memberId)}`, opts);
  }
}
