# Premier Link Portal — Front-end

The real staff-portal front-end (nurse / doctor / admin), wired to the live
backend API. React + TypeScript + Vite, using Google Identity Platform for login.
This replaces the single-file prototype.

> Builds clean (`npm run build` → static bundle in `dist/`). It cannot fully log
> in or load data until the **go-live checklist** below is done — those steps are
> configuration, not code.

## What's built

- **Login** via Google Identity Platform (email + password; MFA is enforced by
  Identity Platform server-side config).
- **Session timeout** — auto-logout after inactivity (window comes from the
  backend `/api/session-policy`). Satisfies the HIPAA session-timeout control.
- **Three role interfaces**, each only showing its own side (the backend enforces
  the real permissions):
  - **Nurse** — my visits, start/complete an assessment, save draft, submit, see
    returned notes, download the signed PDF.
  - **Doctor** — review queue of submitted assessments; approve & sign, or return
    with notes.
  - **Admin** — dashboard, patients (create), scheduling (create/assign), staff
    accounts (invite / deactivate), all assessments.
- **API client** attaches the user's Identity Platform token to every request;
  the backend verifies it and enforces role access.
- The Health Risk Assessment form uses a **provisional field set**
  (`src/hraFields.ts`) clearly marked pending attorney review — the approved
  fields drop straight in there with no backend change.

## Run locally

```bash
cd "Portal Frontend"
npm install
cp .env.example .env     # fill in the two values below
npm run dev              # http://localhost:5173
```

## Configure (2 values)

In `.env` (local) or the Vercel project's Environment Variables:

- `VITE_API_BASE_URL` — the deployed backend (already defaulted to the Cloud Run URL).
- `VITE_FIREBASE_API_KEY` — the **web** API key from Identity Platform → *Application setup details* (a public client key, not a secret).

## Deploy (Vercel — same as the marketing site)

1. Push this folder to a Git repo (or the existing one as `portal-frontend/`).
2. In Vercel: New Project → import the repo → set the two env vars above.
3. Vercel auto-builds on every push (`npm run build`, output `dist/`).
4. Point `portal.premierlinkhealth.com` at this Vercel project (DNS at Squarespace).

## Go-live checklist (configuration, do before real users)

1. **Enable Identity Platform** Email/Password provider, and **enforce MFA** for
   all users (Identity Platform → Settings → Multi-factor authentication).
2. **Open API access** — the backend's public-invocation binding is currently
   blocked by the Google **organization policy** (domain-restricted sharing).
   An admin must grant an exception for the project so the browser can reach the
   API. *(Security setting — owner/admin action.)*
3. **Create the first admin** in Identity Platform + the matching `users` row
   (see the backend runbook), then invite the rest from the Staff Accounts screen.
4. **Verify** session timeout, audit logging, and HTTPS — then test each role end
   to end with fake data before any real patient information.
