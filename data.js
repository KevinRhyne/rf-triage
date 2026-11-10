// Mockup config and seed data. Tweak freely.

const CONFIG = {
  defaultCapacity: 20,
  contact: 'kevin@rhyneandfriends.com',
};

const THEMES = {
  rafsite: {
    label: 'Rhyne & Friends',
    name: 'Rhyne & Friends',
    mark: 'R&F',
    vars: {
      '--color-primary': '#000D27',
      '--color-primary-dark': '#000818',
      '--color-accent': '#76AAFF',
      '--color-accent-light': '#8fb4e1',
      '--color-text-primary': '#ffffff',
      '--color-text-secondary': '#76AAFF',
      '--color-border': 'rgba(118, 170, 255, 0.3)',
    },
  },
  studio: {
    label: 'rhyne.studio (placeholder)',
    name: 'rhyne.studio',
    mark: 'rs',
    vars: {
      '--color-primary': '#16120E',
      '--color-primary-dark': '#0D0A08',
      '--color-accent': '#F0A35E',
      '--color-accent-light': '#E8C39E',
      '--color-text-primary': '#FFF8F0',
      '--color-text-secondary': '#F0A35E',
      '--color-border': 'rgba(240, 163, 94, 0.3)',
    },
  },
};

function seedState() {
  const C = 'acme';
  const t = (daysAgo, h = 10) => {
    const d = new Date('2026-11-09T00:00:00');
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h);
    return d.toISOString();
  };
  const item = (id, type, points, title, extra = {}) => ({
    id, client_id: C, type, points, title,
    description: '', status: 'Planned', comments: [], rolledFrom: null, ...extra,
  });

  const items = [
    item('i1', 'Bug', 2, 'Provider credentials do not save'),
    item('i2', 'Bug', 2, 'Isolation set at intake does not show on the patient card'),
    item('i3', 'Bug', 5, "Referring notes appear in every attempt's activity log"),
    item('i4', 'Bug', 8, 'Follow-up alerts do not clear after acceptance or pending transport'),
    item('i5', 'Bug', 2, 'Discarding a new intake still creates a blank record'),
    item('i6', 'Bug', 2, 'Queue sort ignores the full date range'),
    item('i7', 'Bug', 2, 'Direct connect request missing from history'),
    item('i8', 'Bug', 2, 'Session limit message is unclear'),
    item('i9', 'Feature', 5, 'Save an attempt draft without choosing an activity'),
    item('i10', 'Feature', 2, 'Disable free text in medical service fields'),
    item('i11', 'Feature', 2, 'Larger editor for organization notes'),
    item('i12', 'Feature', 8, 'Reporters can see the status of their own reports'),
    // October history
    item('p1', 'Bug', 2, 'Search box clears when switching tabs', { status: 'Shipped' }),
    item('p2', 'Feature', 8, 'Export queue to CSV', { status: 'Shipped' }),
    item('p3', 'Bug', 5, 'Timezone shown wrong on overnight shifts', { status: 'Shipped' }),
    item('p4', 'Bug', 2, 'Print view cuts off the last column', { status: 'Shipped' }),
  ];
  const DESC = {"i1": "Saving a provider profile with updated credentials shows success, but the old values come back on reload.", "i2": "Isolation precautions chosen during intake are saved, but the patient card in the queue does not show them, so staff miss them at a glance.", "i3": "Notes from the referring facility are copied into the activity log of every attempt instead of only the first, which buries the useful entries.", "i4": "Alerts stay active after the case is accepted or moves to pending transport. They should clear automatically.", "i5": "Cancelling out of a new intake form still leaves an empty record in the queue that someone has to delete by hand.", "i6": "Sorting the queue by date only looks at the visible page, so older items in the selected range show up out of order.", "i7": "When a direct connect request is made from the case screen, it never appears in the case history, so there is no record it happened.", "i8": "The message shown when a session times out does not say what happened or whether work was saved. It should be plain and reassuring.", "i9": "Let staff save a partially filled attempt as a draft before picking an activity type, so they can come back to it later.", "i10": "Medical service fields should only accept values from the list. Free text leads to inconsistent entries that break reporting.", "i11": "The organization notes box is too small for the amount of detail people keep there. Make it larger and resizable.", "i12": "People who report an issue should be able to see where it stands without asking: received, in progress, or resolved.", "p1": "Typing in search and switching tabs wipes the query.", "p2": "Download the current queue view as a CSV file.", "p3": "Overnight shift times displayed in the wrong timezone.", "p4": "The printable view cut off the rightmost column."};
  items.forEach((it) => { it.description = DESC[it.id] || ''; });
  items[0].comments = [{ by: 'Dana', at: t(3, 14), text: 'Seeing this mostly with the night shift accounts.' }];
  items[2].rolledFrom = 'Oct';

  const months = [
    { id: '2026-10', label: 'October', short: 'Oct', capacity: 20, locked: true, closed: true, order: ['p1', 'p2', 'p3', 'p4'] },
    { id: '2026-11', label: 'November', short: 'Nov', capacity: 20, locked: false, closed: false, order: ['i3', 'i1', 'i4'] },
    { id: '2026-12', label: 'December', short: 'Dec', capacity: 20, locked: false, closed: false, order: [] },
    { id: '2027-01', label: 'January', short: 'Jan', capacity: 20, locked: false, closed: false, order: [] },
  ];

  const backlog = ['i9', 'i2', 'i5', 'i12', 'i6', 'i10', 'i7', 'i11', 'i8'];

  const requests = [
    { id: 'r1', client_id: C, type: 'Feature', title: 'Bulk reassign cases when a coordinator is out', description: 'When a coordinator is out, charge nurses have to reassign each case one by one. A way to move all of their open cases at once would save a lot of time.', by: 'Dana', at: t(1, 9), status: 'pending' },
    { id: 'r4', client_id: C, type: 'Feature', title: 'Show the referring facility on the queue', description: 'Staff open every case just to see where it came from. Showing the facility name in the queue row would help triage at a glance.', by: 'Sam', at: t(2, 15), status: 'pending' },
    { id: 'r2', client_id: C, type: 'Feature', title: 'Dark mode', description: 'Night shift staff find the bright screens hard on the eyes.', by: 'Sam', at: t(9, 16), status: 'declined' },
  ];

  const activity = [
    { client_id: C, at: t(12, 11), who: 'Dana', text: 'requested "Session limit message is confusing"' },
    { client_id: C, at: t(11, 15), who: 'Kevin', text: 'accepted a request as "Session limit message is unclear" (2 points)', itemId: 'i8' },
    { client_id: C, at: t(9, 16), who: 'Sam', text: 'requested "Dark mode"' },
    { client_id: C, at: t(8, 10), who: 'Kevin', text: 'declined "Dark mode"' },
    { client_id: C, at: t(8, 17), who: 'Kevin', text: 'closed October. 1 item rolled to November.' },
    { client_id: C, at: t(5, 10), who: 'Dana', text: 'moved "Provider credentials do not save" to November', itemId: 'i1' },
    { client_id: C, at: t(5, 10), who: 'Dana', text: 'moved "Follow-up alerts do not clear after acceptance or pending transport" to November', itemId: 'i4' },
    { client_id: C, at: t(3, 14), who: 'Dana', text: 'commented on "Provider credentials do not save"', itemId: 'i1' },
    { client_id: C, at: t(1, 9), who: 'Dana', text: 'requested "Bulk reassign cases when a coordinator is out"' },
  ].reverse();

  return {
    client: { id: C, name: 'Acme Health' },
    user: null,
    view: 'board',
    theme: 'rafsite',
    items, months, backlog, requests, activity,
  };
}
