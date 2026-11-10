# Supabase setup for Triage

One-time steps in the Supabase dashboard (project `iriaufhlhlkrafjltaxo`).

## 1. Lock down sign-ups

**Authentication → Sign In / Providers**
- Email provider: **enabled**
- **Allow new users to sign up: off** (logins are only created by you)
- **Confirm email: off** (the login emails aren't real inboxes)

## 2. Create the tables and rules

**SQL Editor → New query**, paste all of `schema.sql`, run. Safe to run again later after edits.

## 3. Add a client

In the SQL editor (change the values):

```sql
insert into clients (code, name, plan, default_capacity)
values ('ACME', 'Acme Health', 'Medium Retainer', 20);
```

`code` is what the client types to sign in (case doesn't matter).

## 4. Create the logins

**Authentication → Users → Add user → Create new user**, tick **Auto Confirm User**:

| Login | Email | Password |
|---|---|---|
| The client | `acme@triage.rhyneandfriends.com` (the code, lowercased) | the shared client password |
| You (admin) | `kevin@triage.rhyneandfriends.com` | your password |

Then link them, in the SQL editor:

```sql
-- client login -> client
insert into members (user_id, client_id, role)
select u.id, c.id, 'client'
from auth.users u, clients c
where u.email = 'acme@triage.rhyneandfriends.com' and c.code = 'ACME';

-- admin login (sees every client)
insert into members (user_id, role)
select id, 'admin' from auth.users where email = 'kevin@triage.rhyneandfriends.com';
```

You sign in with code `KEVIN` and your password.

## Changing a client's password

**Authentication → Users**, find `<code>@triage.rhyneandfriends.com`, **Reset password** isn't used (no real inbox); use the row menu to set a new password, then share it.
