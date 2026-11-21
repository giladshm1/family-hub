# הבית שלנו — Family Hub

A small family web app (Hebrew, RTL): dishwashing leaderboard and car reservations,
synced live between all family members.

- **Hosting:** GitHub Pages (static files in this repo)
- **Data + sign-in:** Firebase (Firestore + Google sign-in), free plan
- **Permissions:** enforced on the server by `firestore.rules`

## How it works
1. The first person to sign in picks who they are and becomes the **owner** (always an admin).
2. Everyone else signs in with Google → appears under **ניהול משפחה** → an admin assigns them to a family member.
3. Admins can update scores, cancel any booking, rename members and grant admin rights.

## Files
| File | What's in it |
|---|---|
| `config.js` | Firebase config, app name, default members, cars, note presets |
| `data.js` | All Firebase access (auth + Firestore) |
| `store.js` | In-memory state fed by live subscriptions |
| `ui.js` | Utilities, icons, avatars, toasts, modals, event delegation |
| `widgets.js` | The widgets (leaderboard, cars, family admin) + how to add more |
| `app.js` | Screens, header, tabs, subscriptions, boot |
| `firestore.rules` | Server-side permissions (paste into Firebase → Firestore → Rules) |

## Changing things
- **Cars:** edit `CARS` in `config.js` *and* the car id list in `firestore.rules`.
- **New widget:** see the comment at the top of `widgets.js`.
- **Members:** edit in the app (ניהול משפחה). `DEFAULT_MEMBERS` is only used on first setup.
