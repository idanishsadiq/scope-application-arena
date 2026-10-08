# SCOPE Application Arena v2

A polished live multiplayer SCOPE application-review game for workshops, masterclasses and competitions. Built for a host + projector + up to 50+ phones, with isolated rooms, staff authentication, persistent results, a question bank and CSV exports.

## What is new in v2

- Secure staff/admin sign-in through Supabase Auth.
- Admin dashboard with multiple simultaneous game rooms.
- Host console for each room.
- Separate answer-key table so player browsers do not receive correct answers before reveal.
- Persistent player identities per room.
- Realtime game-state broadcasts per room.
- PostgreSQL scoring and result persistence.
- Complete historical result table and CSV export.
- Reusable question bank managed by admins.
- Demo mode with no backend credentials for UI testing.
- Mobile-first player experience and large-screen host experience.
- SCOPE and KazMSA logos included.

## Quick preview

Open `index.html` through a local web server and use:

- `#/` — landing page
- `#/play` — player join
- `#/staff` — staff login
- `#/host` — host game list
- `#/admin` — admin dashboard

Demo mode is enabled when `config.js` has empty Supabase credentials.

## Production setup — Supabase

1. Create a Supabase project.
2. Enable **Anonymous Sign-Ins** under Authentication → Sign In / Providers. Supabase documents anonymous sign-ins as authenticated users without requiring email or other PII: https://supabase.com/docs/guides/auth/auth-anonymous
3. In the SQL Editor, run `supabase/schema.sql`.
4. Create your first staff user under Authentication → Users.
5. Copy that user's UUID and run:

```sql
insert into public.staff_profiles(user_id,email,display_name,role)
values('YOUR-AUTH-USER-UUID','you@example.com','Your Name','admin');
```

6. Sign in at `#/staff`.
7. To approve another host account, create the Auth user first and then, while signed in as admin, run:

```sql
select public.promote_staff('host@example.com','host');
```

8. Copy your project's **publishable key** and URL into `config.js`:

```js
window.SCOPE_CONFIG = {
  supabaseUrl: 'https://YOURPROJECT.supabase.co',
  supabasePublishableKey: 'sb_publishable_...',
  demoMode: false,
  appName: 'SCOPE Application Arena',
  defaultRoundSeconds: 20
};
```

Use the browser-safe publishable key. **Never put a Supabase secret/service_role key in this repository.** Supabase's current JavaScript docs support CDN installation and publishable keys for browser clients: https://supabase.com/docs/reference/javascript/installing

## Realtime

The app uses one Realtime topic per game (`game:<game_id>`). Supabase Broadcast is designed for low-latency game events and Supabase currently recommends Broadcast over Postgres Changes for scalability/security-sensitive realtime flows. https://supabase.com/docs/guides/realtime/broadcast

Each game is isolated. Running Game A does not mix its players or broadcasts with Game B.

## Hosting

This is a static frontend. You can deploy the repository on Vercel, Netlify, GitHub Pages, Cloudflare Pages or another static host. For GitHub Pages, remember that hash routes are intentionally used, so no server-side rewrite is required.

## Event workflow

### Admin

1. Sign in.
2. Create Game A.
3. Create Game B.
4. Open each host console in its own browser tab/device.
5. Share the individual room code/QR with each audience.
6. Export results from each room.

### Host

1. Open the room.
2. Project the host console.
3. Players join using the room code.
4. Start the round.
5. Lock/reveal.
6. Advance.
7. Finish the game.
8. Export CSV.

### Player

1. Open `#/play`.
2. Enter room code + nickname.
3. Vote within the countdown.
4. Lock answer.
5. Watch the reveal.

## Security model

- Staff uses Supabase Auth.
- Staff permissions are stored in `staff_profiles`.
- RLS is enabled on all application tables.
- Players can read the public round content only after joining the game.
- Correct answers live in `round_keys`, a separate table readable only by staff.
- Player votes are submitted through the `submit_vote` RPC; duplicate submissions are rejected.
- Game state changes go through the `host_action` RPC.
- Scoring and final ranking are calculated in PostgreSQL when the game is finished.
- The frontend never contains a service role/secret key.

## Important production test

Before a live event, create a staging game and test:

- 10–20 real phones on the same venue network.
- 50 simulated/player browser sessions if possible.
- A host refresh during a live round.
- A player refresh/reconnect.
- Two simultaneous rooms.
- A room with duplicate nicknames.
- A partially submitted round.
- CSV export after finishing.

The UI can be tested immediately in demo mode, but real multi-phone realtime behavior requires your Supabase project credentials and the SQL migration above.
