# Client Portal: Mockup Brief

A minimal, branded portal where a retainer client reviews curated issues, ranks them, and fills each monthly release up to its capacity. Kevin curates and sizes. The client ranks and chooses. Kevin locks the month.

This brief is the starting point for a clickable mockup. Behavior details are still open and will be worked out while building it.

## Scope for now

- Clickable HTML mockup only. Fake data, no backend, no real auth.
- Static files, no build step, same as the rest of this repo.
- Placeholder client: "Acme Health".

## Who uses it

- **Client:** signs in with a client code and password, then enters their name. The name is recorded on every action so the activity feed shows who did what.
- **Kevin (admin):** adds and edits issues, sizes them, curates requests, sets status, locks and unlocks months.

## Screens

1. **Login.** Client code, password, your name.
2. **Board.**
   - Retainer months across the top (for example November, December). Each month shows two capacity meters: Features (for example 2 of 3) and Bugs (for example 6 of 8).
   - The backlog below: the curated list, ranked by drag.
   - Drag an item from the backlog into a month to plan it. Drag back out to unplan.
   - A locked month is frozen for the client.
3. **Item detail.** Title, description, type (Bug or Feature), size (S or M), status, comments, and that item's history.
4. **Requests.** The client submits a request (one line of problem, one line of who it hurts) or pastes a list that splits into separate requests. Requests land in a Proposed inbox that only Kevin sees until he rewrites, sizes, and accepts them into the backlog, or declines them with a reason.
5. **Activity feed.** Who moved, ranked, commented, or requested what, and when.

## Rules

- Statuses are **Planned** and **Shipped** only. Anything that does not ship stays Planned and moves to the next month.
- Only sized items can be dragged into a month. Kevin sizes, the client ranks.
- Anything larger than M is split or handled as a separate quote.
- Critical issues bypass the portal. One line on the board says to contact Kevin directly.
- Lock is admin only. Changes after lock go through Kevin.

## Brand

Use the rafsite look, but as a swappable theme (name, logo, colors), because the portal will also run under rhyne.studio.

- Background `#000D27`, deeper `#000818`
- Accent `#76AAFF`, light accent `#8fb4e1`
- Text white, secondary text accent blue
- Borders `rgba(118, 170, 255, 0.3)`
- Font: Acumin Variable Concept, black italic for wordmark and headings. The font files are not in `assets/fonts/`, so use a fallback until they are added.
- Outlined accent buttons that fill on hover, 8px radius
- Tokens live in `css/variables.css`

Keep a `client_id` on every record from the start so more clients can be added later.

## Sample data

About 12 issues, neutral wording, no real names or identifiers:

| Type | Size | Title |
|---|---|---|
| Bug | S | Provider credentials do not save |
| Bug | S | Isolation set at intake does not show on the patient card |
| Bug | M | Referring notes appear in every attempt's activity log |
| Bug | M | Follow-up alerts do not clear after acceptance or pending transport |
| Bug | S | Discarding a new intake still creates a blank record |
| Bug | S | Queue sort ignores the full date range |
| Bug | S | Direct connect request missing from history |
| Bug | S | Session limit message is unclear |
| Feature | M | Save an attempt draft without choosing an activity |
| Feature | S | Disable free text in medical service fields |
| Feature | S | Larger editor for organization notes |
| Feature | M | Reporters can see the status of their own reports |

## Open behavior questions

To work through while mocking:

- Capacity as two counts (features and bugs) or one point total
- How ranking interacts with planned items (does a month have its own order)
- What the client sees for a declined request
- What lock looks like, and whether unlock leaves a trace in the feed
- How shipped items and past months are shown
