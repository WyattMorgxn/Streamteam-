/**
 * src/discord.js
 *
 * Personal-invite issuing and join detection.
 *
 * Each signup gets an invite with max_uses: 1 and max_age: 0. Discord drops a
 * fully-used invite from the guild's list and never expires it on its own, so
 * "code is no longer in the list" means exactly one thing: someone joined
 * through it.
 *
 * Requires DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_INVITE_CHANNEL_ID,
 * and the bot to hold Manage Server on the guild.
 */

const DISCORD_API = "https://discord.com/api/v10";

function authHeaders() {
  return { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` };
}

/** Create a single-use, never-expiring invite. Returns the invite code. */
async function createPersonalInvite() {
  const res = await fetch(
    `${DISCORD_API}/channels/${process.env.DISCORD_INVITE_CHANNEL_ID}/invites`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ max_age: 0, max_uses: 1, unique: true }),
    }
  );

  if (!res.ok) {
    throw new Error(`Discord invite create failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()).code;
}

/** All invite codes currently live on the guild. Throws rather than returning
 *  an empty array on failure — callers must not mistake an API error for
 *  "every invite has been used". */
async function listGuildInviteCodes() {
  const res = await fetch(
    `${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/invites`,
    { headers: authHeaders() }
  );

  if (!res.ok) {
    throw new Error(`Discord invite list failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()).map((i) => i.code);
}

module.exports = { createPersonalInvite, listGuildInviteCodes };
