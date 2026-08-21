// Idempotent seed: running twice doesn't duplicate rows.
// Usage: npm run seed
require("dotenv").config();
const { pool } = require("../src/db");

const USERS = [
  {
    twitch_id: "seed_u001", twitch_login: "valorant_vibes",
    display_name: "Valorant Vibes", bio: "Radiant grind, no days off. LF duo collab.", game_category: "Valorant",
    schedule_text: "Tues/Thurs/Sat 8–11 PM EST",
    avatar_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/seed-valorant.jpg",
  },
  {
    twitch_id: "seed_u002", twitch_login: "craftycraft_mc",
    display_name: "CraftyCraft MC", bio: "Hermitcraft-style SMP builder. Let's collab on megabases.", game_category: "Minecraft",
    schedule_text: "Daily 3–6 PM PST",
    avatar_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/seed-minecraft.jpg",
  },
  {
    twitch_id: "seed_u003", twitch_login: "just_chattin_jay",
    display_name: "Just Chattin Jay", bio: "Hot takes and chill vibes. IRL & variety content.", game_category: "Just Chatting",
    schedule_text: "Mon/Wed/Fri 7 PM EST",
    avatar_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/seed-justchatting.jpg",
  },
  {
    twitch_id: "seed_u004", twitch_login: "apexlegendsluna",
    display_name: "Apex Luna", bio: "Diamond Wraith main. Looking for pred-push collab partners.", game_category: "Apex Legends",
    schedule_text: "Weekends noon–5 PM PST",
    avatar_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/seed-apex.jpg",
  },
  {
    twitch_id: "seed_u005", twitch_login: "fortnite_frost",
    display_name: "Fortnite Frost", bio: "Chapter 5 competitive grind. Best builders only.", game_category: "Fortnite",
    schedule_text: "Every day 4–8 PM CST",
    avatar_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/seed-fortnite.jpg",
  },
  {
    twitch_id: "seed_u006", twitch_login: "hearthstone_hana",
    display_name: "Hearthstone Hana", bio: "Legend every season. Explaining card choices in real time.", game_category: "Hearthstone",
    schedule_text: "Mon–Fri 9 PM–midnight PST",
    avatar_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/seed-hearthstone.jpg",
  },
  {
    twitch_id: "seed_u007", twitch_login: "ffxiv_faerie",
    display_name: "FFXIV Faerie", bio: "Savage raider & glamour collector. Casual LGBTQ+ community.", game_category: "Final Fantasy XIV",
    schedule_text: "Tues/Thurs/Sun 7 PM EST",
    avatar_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/seed-ffxiv.jpg",
  },
  {
    twitch_id: "seed_u008", twitch_login: "rocketleague_rex",
    display_name: "Rocket League Rex", bio: "Champ 2 aiming for GC. Freestyles & ranked content.", game_category: "Rocket League",
    schedule_text: "Sat/Sun 2–6 PM EST",
    avatar_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/seed-rl.jpg",
  },
  {
    twitch_id: "seed_u009", twitch_login: "elden_elena",
    display_name: "Elden Elena", bio: "Soulsborne veteran. No summons, no guides, no mercy.", game_category: "Elden Ring",
    schedule_text: "Wed/Fri/Sat 6 PM EST",
    avatar_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/seed-eldenring.jpg",
  },
  {
    twitch_id: "seed_u010", twitch_login: "variety_vance",
    display_name: "Variety Vance", bio: "New game every week. Come for the chaos, stay for the community.", game_category: "Variety",
    schedule_text: "Mon/Tues/Thurs 8 PM PST",
    avatar_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/seed-variety.jpg",
  },
];

async function seed() {
  let inserted = 0;

  for (const u of USERS) {
    const { rows } = await pool.query(
      `INSERT INTO users (twitch_id, twitch_login)
       VALUES ($1, $2)
       ON CONFLICT (twitch_id) DO UPDATE SET twitch_login = EXCLUDED.twitch_login
       RETURNING id`,
      [u.twitch_id, u.twitch_login]
    );
    const userId = rows[0].id;

    await pool.query(
      `INSERT INTO profiles (user_id, display_name, bio, game_category, avatar_url, schedule_text)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name  = EXCLUDED.display_name,
         bio           = EXCLUDED.bio,
         game_category = EXCLUDED.game_category,
         avatar_url    = EXCLUDED.avatar_url,
         schedule_text = EXCLUDED.schedule_text,
         updated_at    = now()`,
      [userId, u.display_name, u.bio, u.game_category, u.avatar_url, u.schedule_text]
    );

    inserted++;
  }

  console.log(`Seed complete: ${inserted} profiles upserted`);
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
