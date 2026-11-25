# Firebase → Supabase: setup steps

Project: `https://wqcdjlenpqyzqynxofzo.supabase.co`

## 1. Database (5 min)
Supabase dashboard → **SQL Editor** → paste all of
`supabase/migrations/20261125000000_init.sql` → **Run**.
Creates the tables, security rules, credit/promo/payment functions and the `media` storage bucket.

## 2. Login settings
Dashboard → **Authentication**:
- **Sign In / Providers → Email**: turn **off** "Confirm email" (Firebase didn't require it). If you keep it on, new users must click the email link first.
- **Sign In / Providers → Google**: enable, paste the Google OAuth Client ID + Secret
  (Google Cloud console → the existing OAuth client). In Google Cloud add the redirect URI
  `https://wqcdjlenpqyzqynxofzo.supabase.co/auth/v1/callback`.
- **URL Configuration**: Site URL `https://www.mendchilgee.site`; add redirect URLs
  `https://www.mendchilgee.site/**`, `https://mendchilgee.site/**`, `http://localhost:5173/**`.

## 3. Payment function (BYL)
```
npx supabase login
npx supabase link --project-ref wqcdjlenpqyzqynxofzo
npx supabase secrets set BYL_PROJECT_ID=... BYL_TOKEN=... BYL_WEBHOOK_SECRET=... BASE_URL=https://www.mendchilgee.site ADMIN_SECRET=<long random>
npx supabase functions deploy api --no-verify-jwt
```
Then in the **BYL dashboard** change the webhook URL to
`https://wqcdjlenpqyzqynxofzo.supabase.co/functions/v1/api/bylWebhook`.

Optional, expire paid gifts daily: SQL Editor →
`select cron.schedule('expire-gifts', '0 * * * *', 'select public.expire_gifts()');`
(enable the `pg_cron` extension first under Database → Extensions).

## 4. Copy the old Firebase data
Needs `scripts/serviceAccountKey.json` (Firebase service account) and the Supabase **secret** key
(Project Settings → API Keys → secret / service_role). Never commit either.
```
cd scripts
$env:SUPABASE_URL="https://wqcdjlenpqyzqynxofzo.supabase.co"
$env:SUPABASE_SECRET_KEY="<secret key>"
node migrate-firebase-to-supabase.mjs --dry-run
node migrate-firebase-to-supabase.mjs --files
```
- Gift IDs are kept, so old share links keep working.
- Firebase passwords can't be copied: email users sign in with Google (same email)
  or use "forgot password" once. Google users just sign in.
- Make yourself admin again: SQL Editor →
  `update profiles set data = data || '{"role":"admin"}' where data->>'email' = 'YOUR_EMAIL';`

## 5. Vercel
Project → Settings → Environment Variables:
```
NEXT_PUBLIC_SUPABASE_URL=https://wqcdjlenpqyzqynxofzo.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
Remove the old `VITE_FIREBASE_*` and `VITE_FUNCTIONS_BASE_URL` variables, then redeploy.

## After it's live
When everything works for a few days you can delete `functions/`, `firebase.json`,
`firestore.rules`, `firestore.indexes.json`, `storage.rules`, `.firebaserc` and the Firebase project.
