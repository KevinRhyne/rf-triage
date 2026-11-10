# Client Portal Mockup: Status

Where the design stands as of November 2026. `BRIEF.md` is the original starting brief; this file records what was decided while building it and supersedes the brief where they differ.

## Run it

```sh
python3 -m http.server 8123   # from the repo root
```

Open http://localhost:8123/triage/. Local runs use the real Supabase data, so sign in the same way as on the live site.

If changes don't show, hard refresh (Cmd+Shift+R). The simple server lets the browser cache JS and CSS.

## Live

- **URL:** https://triage.rhyneandfriends.com
- **Hosting:** GitHub Pages on the public repo `KevinRhyne/rf-triage`, which holds only this folder. DNS is a Squarespace CNAME `triage` to `kevinrhyne.github.io`.
- **Data:** Supabase project `iriaufhlhlkrafjltaxo`. Setup and adding clients: `supabase/SETUP.md`.
- **Source of truth:** this `triage/` folder on the `triage` branch of rafsite. To deploy changes, commit here, then from the repo root:

```sh
git subtree push --prefix=triage rf-triage main
```

(`rf-triage` is the git remote for the deploy repo.)

## Files

| File | What it holds |
|---|---|
| `index.html` | Page shell |
| `config.js` | Supabase URL, publishable key, hidden login email domain |
| `core.js` | State, persistence, rules (`canMove`, capacity, locks), actions (move, comment, requests, admin edits). Exposes `window.Portal` |
| `portal.js` | Rendering and interaction: sidebar, list, expandable cards, requests, drag to reorder |
| `portal.css` | All styles. Tokens are in `variables.css` (a copy of the site tokens, so this folder deploys on its own) |

Schema changes go in `supabase/schema.sql` (safe to re-run in the SQL editor).

## Design decisions so far

**Layout**
- Two columns, centered, max width 1180px: a rounded sidebar panel and the item list.
- No separate detail pane. Cards expand in place (animated) to show the full description and comments.
- Sidebar header: large "R&F" mark, client name, plan name ("Medium Retainer").
- Sidebar: open months with a points count and thin meter, then Backlog and Requests. (Shipped months list and month locking were removed.)
- Month page header: upright month title, then a 26px capacity bar with "X of Y points" inside the fill (no edge accent), then a divider. Backlog and Requests headers are just the title and divider, with the title at the same height as on month pages.

**Cards**
- 56px type tile on the left, vertically centered: point count over a colored "Bug" or "Feat" label (full word on hover). Requests show just the type.
- Title and two-line description preview. The expanded section sits in its own grid row so the tile never moves.
- No rank numbers. Order is position.

**Points and capacity**
- Points are arbitrary whole numbers set by Kevin. Working scale: easy bugs 1 to 2, small feature improvements about 4, larger features or additions about 8.
- Default month capacity is 20 points (`defaultCapacity` in `data.js`).
- A client can't drop an item into a month without room; the drop is refused with the reason.

**Drag and drop**
- Pointer based, not native HTML drag. The card lifts into a floating copy, its slot travels through the list while other cards slide aside, and the copy settles into place on drop.
- Dropping on a month or Backlog in the sidebar moves the item (blue highlight if allowed, red if not).
- Any open card collapses instantly when a drag starts.

**Requests (client)**
- A full-width, card-styled "+ New request" button at the top of the Requests page expands in place into the editor: Title, Description, Bug or Feature, Cancel, Submit.
- Requests page lists pending requests first, then declined ones.
- Pending requests can be edited (title, description, type) with an explicit Save button that only appears once something changed. Closing discards unsaved edits.
- Delete (red outline) asks for a second click to confirm.
- Requests have comments. Author and date show only when a request is open.
- Declined requests stay visible, faded, with a red "Declined" note.

**Kevin (admin)**
- Same pages, extra controls.
- Requests: set points, then Add to backlog (goes to the bottom of the backlog, comments carry over) or Decline.
- Items: title and description editable in place (saves as you type), Bug/Feature toggle, points field, Shipped toggle on items in a month.

## Not built yet / open

- Login screen, activity feed, and close-month flow (they existed in an earlier version and were removed while simplifying).
- Item edits for Kevin autosave while request edits use Save. Decide whether items should get a Save button too.
- Points can't be cleared back to "unestimated" from the UI.
- Client switcher for multiple clients (a `client_id` is already on every record).
- Theme swap for rhyne.studio: colors come from tokens, but the "R&F" mark text is hard coded in `portal.js`.
- `core.js` still has unused helpers from earlier layout experiments (`enableDrag`, `pour`, `flatOrder`, `nudge`).
