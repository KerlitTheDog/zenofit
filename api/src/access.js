/* Who may do what to a profile.
 *
 * Three levels, deliberately few:
 *   owner  created it. Only the owner manages seeds and grants.
 *   write  joined on a write seed. Reads and writes the data, nothing else.
 *   read   joined on a read seed. Reads only.
 *
 * A revoked grant and a never-granted one are the same answer: null. The
 * caller turns that into a 404, not a 403, so probing for profile ids tells
 * an outsider nothing.                                                      */

export async function accessFor(env, userId, profileId) {
  /* position and name_updated_at ride along because the roster is account
     data: every route that reads a profile row also reports where it sits
     in the list and when its name was last set. */
  const profile = await env.DB.prepare(
    "SELECT id, owner_id, name, created_at, updated_at, deleted_at, position, name_updated_at " +
    "FROM profiles WHERE id = ?"
  ).bind(profileId).first();

  if (!profile || profile.deleted_at) return { level: null, profile: null };
  if (profile.owner_id === userId) return { level: "owner", profile };

  const grant = await env.DB.prepare(
    "SELECT level FROM grants WHERE profile_id = ? AND user_id = ? AND revoked_at IS NULL"
  ).bind(profileId, userId).first();

  if (!grant) return { level: null, profile: null };
  return { level: grant.level === "write" ? "write" : "read", profile };
}

export const canRead  = (level) => level === "owner" || level === "write" || level === "read";
export const canWrite = (level) => level === "owner" || level === "write";
export const canAdmin = (level) => level === "owner";
