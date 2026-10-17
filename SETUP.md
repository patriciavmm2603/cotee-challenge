# Wellness Tracker - setup guide

A workplace fitness challenge app for ~100 people.

## Live backend (done 2026-10-17)

The app runs on the shared `familynest-budget` Supabase project, alongside
Pat's other apps. Its tables are namespaced `cotee_*` (cotee_profiles,
cotee_activities, cotee_challenges, cotee_entries) plus the `cotee-proofs`
photo bucket, so nothing collides with other apps' data. Row-level security
keeps each app's data fenced off; only the project owner can see everything.

`config.js` holds the project's public URL and anon key. The 35 starter
activities are seeded in the database; the Admin tab can reprice or add more.

Magic-link sign-in: the app sends users to `window.location.pathname`, so the
GitHub Pages URL must be listed under Supabase **Authentication** > **URL
Configuration** > **Redirect URLs**:
`https://patriciavmm2603.github.io/cotee-challenge/`

## Making someone an admin

Run in the SQL editor (replace with the person's login email):

```sql
update public.cotee_profiles set is_admin = true
where id = (select id from auth.users where email = 'person@example.com');
```

## Full setup (real backend, free tier) - historical, already done

## What Pat needs to do (about 20 minutes)

### 1. Create the Supabase project (free)
1. Go to supabase.com and sign in (or make a free account).
2. New project. Name it `cotee-challenge`, pick a database password, keep the free plan.
3. Wait until it says the project is ready.

### 2. Build the database (one paste)
1. In the Supabase dashboard, open **SQL Editor** > **New query**.
2. Open `schema.sql` from this folder, copy everything, paste it in, press **Run**.
3. It creates the tables, the login rules, the leaderboard, the photo bucket,
   and 35 starter activities with point values (cardio, strength,
   flexibility, sports).

### 3. Connect the app
1. In Supabase, go to **Project Settings** > **API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `config.js` in this folder and paste them in.

### 4. Allow the sign-in link to come back to the app
1. In Supabase, go to **Authentication** > **URL Configuration**.
2. Under **Redirect URLs**, add your GitHub Pages address, for example
   `https://YOURNAME.github.io/cotee-challenge/` (you will know it after step 5).
3. Save. (You can come back and do this after step 5.)

### 5. Publish the app
1. On GitHub, create a new repository named `cotee-challenge`.
2. Upload all the files from this folder to it.
3. Repo **Settings** > **Pages** > Deploy from branch > `main`, folder `/ (root)`.
4. Your link will be `https://YOURNAME.github.io/cotee-challenge/`.

### 6. Make Alec the admin
1. Alec opens the link on his phone and signs in with his email (magic link).
2. He picks his name and character. That creates his profile row.
3. In the Supabase **SQL Editor**, run:
   ```sql
   update public.cotee_profiles set is_admin = true where email = 'alec@his-email.com';
   ```
   (Use his real email.) He reloads the app and gets the **Admin** tab.

### 7. Share it
Send the link to the coworkers. They sign in with email, pick a name and
character, and start logging. Alec creates the first challenge in the app
(Challenges tab > + New challenge).

## Alec's admin powers (in the app, no code)
- **Challenges tab**: create weekly/monthly challenges with a target score.
- **Admin tab > Point rules**: change any activity's points, add new
  activities, turn ones off.
- **Admin tab > Proof review**: see every photo proof, flag or remove
  anything bogus. Flagged entries vanish from the board.

## Notes
- Photos are compressed on the phone before upload, so the free 1 GB of
  storage holds thousands of them.
- The project pauses after 7 idle days on the free tier. During a challenge
  that will not happen; between challenges it wakes up on the next visit.
- Supabase's free email sender has an hourly cap. If a lot of people sign up
  at the same hour and links are slow, stagger the invites or connect a
  custom SMTP later (free options exist).
- Proof photos sit in a public storage bucket (needed so everyone can see
  the board). Anyone with a photo's link can open it, but links are not
  listed anywhere.
