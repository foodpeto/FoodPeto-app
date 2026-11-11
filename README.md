# FoodPeto Apps

Three apps for FoodPeto (fresh-cooked meals for dogs and cats) plus the backend they share. The ordering flow is modelled on Swiggy; colours, fonts and logo come from foodpeto.com. Support / WhatsApp number: **8209976467**.

| App | Path | Who uses it | Login |
|---|---|---|---|
| **Customer app** | `/customer/` | Pet parents | Email + password · sign up in the app |
| **Delivery partner app** | `/rider/` | Riders | Email + password · "Apply to join", then admin approves |
| **Admin & publisher console** | `/admin/` | Kitchen team | Email + password · staff accounts created by the owner |
| Launcher + live demo | `/` | All three side by side | — |

## Logins & accounts

**Customers** sign up with name, email, mobile number, password, address and an optional referral code (invite links fill the code in). They then add their pet. They can reset a forgotten password and change it under **Account → Change password**.

**Delivery partners** tap **Apply to join** (name, mobile, vehicle, licence number, area, email, password). They can log in straight away but see **Application under review** until a manager approves them under **Admin → Delivery partners**. Their screen switches to the duty screen the moment they're approved. Admins can also add partners directly, pause them or reset their password.

**Admin staff** have their own accounts. There is no public sign-up for the console.

| Role | Can use |
|---|---|
| Owner | Everything, including **Staff & access** (add, change role, deactivate, remove, reset password) |
| Manager | Everything except staff accounts (including Vet partners) |
| Kitchen | Dashboard, live orders, partners on duty, weekly menu, recipes |

The owner adds staff and gets a **temporary password** to share. Staff (and anyone whose password an admin resets) must choose their own password at first sign-in.

**First owner login:** `admin@foodpeto.com` with the password the server printed when it first created the owner account. Your existing admin password carried over; you'll be asked to choose a new one. If you forget it, run `node server.js --reset-owner-password`. To start fresh with your own email, set `OWNER_EMAIL` and `OWNER_PASSWORD` before the owner is first created.

**Security:**
- Passwords are hashed with scrypt and never sent to any app.
- Passwords need 8+ characters with a letter and a number.
- 8 wrong attempts locks that login for 15 minutes.
- Sessions last 30 days. Changing or resetting a password signs out other devices, and deactivated staff are signed out immediately.
- Each app only accepts its own accounts, so a customer login can't open the partner or admin app.

**Forgot password:** the user gets a 6-digit code that expires in 15 minutes. In **test mode** (the default) the code is shown on screen and printed in the server console. To send real emails, connect an email service (Resend, SendGrid, Amazon SES or Gmail SMTP) in `server/api.js → sendEmail()` and run with `EMAIL_MODE=live`. Until then, an admin can reset a customer's or partner's password from the console.

**Sample accounts** (demo data only, password `pawsome123`): customers `aarav@example.com`, `priya@example.com` and the other sample customers; partners `sameer@example.com`, `neha@example.com`, `vikram@example.com`, `arjun@example.com`; `ravi@example.com` is a pending application you can approve.

## Pet-specific menus

The customer app only shows food suitable for the **selected pet**. Dog-only dishes are hidden for cats and the reverse, and non-veg dishes are hidden for pets set to veg. Categories, search, treats, today's bowls and reorders all follow this. If a pet parent switches pets with an unsuitable dish in the cart, the cart flags it and won't place the order. The server also refuses such orders.

## Vet partners

**Admin → Vet partners** (owner and managers):
- add partner vets and clinics with their specialties, visit types (clinic, home, video), fee, discount for FoodPeto customers, commission, contract dates and private notes
- pause a vet, or hide them from the app
- follow up consultation requests (New → Contacted → Booked → Closed)

Customers see visible partners under **Account → Vet care**, filtered to vets who treat their selected pet. They can call the clinic or **request a consultation**. Commission, contract details and notes are never sent to the customer app. Two sample vets are included; edit or remove them.

## Run it

Requires Node.js 22.5 or newer (for the built-in SQLite). Nothing to install.

```bash
node server.js
```

The console prints:
- the address for this computer (`http://localhost:5173`) and for **phones on the same Wi-Fi** (e.g. `http://192.168.x.x:5173`)
- the **owner's email** (and the owner password, only on the run that creates the owner account)
- password-reset codes while in test mode

| Setting | Default | Purpose |
|---|---|---|
| `PORT` | `5173` | Port to listen on |
| `OWNER_EMAIL` / `OWNER_PASSWORD` | `admin@foodpeto.com` / generated | First owner account (used only when no owner exists yet) |
| `EMAIL_MODE` | `dev` | `dev` shows reset codes on screen. `live` emails them once you connect a provider in `server/api.js → sendEmail()` |

Data is stored in `data/foodpeto.db` (SQLite). Delete the `data` folder, or use **Admin → Settings → Reset demo data**, to start over.

## Database

**SQLite**, using the version built into Node.js (`node:sqlite`). It's a single file on your computer, `data/foodpeto.db`. There's no cloud database provider, no account and no monthly bill. Back up that file to keep your data. If you later need several servers or cities, only `server/db.js` has to change to move to Postgres (e.g. Supabase or Neon).

## Android apps (APK) and updates

```bash
node tools/build-apk.js
```

This builds `downloads/foodpeto-customer-<version>.apk` and `downloads/foodpeto-partner-<version>.apk`, using the Android SDK and JDK already on this PC (no Gradle or Android Studio needed). It works on Android 8 or newer. Each APK is a small native shell that shows the live app from the server.

**Install on a phone:** with the server running, open `http://<this-PC's-IP>:5173/downloads/` on the phone (same Wi-Fi), tap Download, and allow "install unknown apps" when asked.

**How updates work**

| You change… | What happens on phones |
|---|---|
| Web app code (screens, features, text) | Open apps show **"✨ A new version of FoodPeto is ready · Update"**. Tapping reloads the app. No new APK is needed. |
| The Android shell, or you want everyone on a new build | Run `node tools/build-apk.js --notes "What's new|Another change"`. The app shows **"Update available"** with your notes. **Update now** downloads the new APK and opens the installer. |
| A must-have fix | Add `--min <build>`, e.g. `--min 3`. Phones below build 3 see **"Update required"** with no "Later" button. |

Other options: `--app customer|partner`, `--version 1.2.0`, `--server https://app.foodpeto.com` (use this once you have hosting, then publish an update so every phone switches over).

> **Back up `android/foodpeto-release.jks` and `android/keystore.json`.** Android only installs an update if it's signed with the same key. If you lose them, every user has to uninstall and reinstall.

If the app can't reach the server (e.g. the PC's IP changed), it shows a **"Can't reach FoodPeto"** screen where you can type the new server address.

## Demo walkthrough

1. **Customer**: log in as `aarav@example.com` (or create a new account). Add a dish, open the cart, fill in **Before you order** (comment, customization, special request, allergies), switch on **Use a free meal**, and place the order.
2. **Admin**: sign in as the owner. Under **Live orders** the card shows the allergies and instructions. Click **Accept & cook**, then **Mark packed**.
3. **Partner**: log in as `sameer@example.com` and accept the request. Tap **Arrived at kitchen**, tick the items (the instructions show here too), then **Confirm pickup**.
4. **Partner**: enter the OTP from the customer's tracking screen and tap **Mark as delivered**.

## What's new in this version

### Backend
- One Node server (`server.js` + `server/`) serves the apps and a JSON API, with no dependencies.
- **SQLite storage.** The server writes back only the records that changed after each action.
- **Live updates.** The server pushes a change signal to every open app (Server-Sent Events), and each app fetches the data it is allowed to see.
- **Logins:** email and password for all three apps. See [Logins & accounts](#logins--accounts).
- **Each role sees only its own data.** Customers see only their own orders and profile. Partners never receive the delivery OTP, and see only the area for orders they haven't accepted. Only admins see everyone.
- **The server checks every order.**
  - It recalculates prices itself and ignores prices sent by the app.
  - It rejects dishes that aren't on that day's menu, past days, and a closed kitchen.
  - It validates coupons and free meals.
- Every action checks the caller's role. An action that fails changes nothing.
- The database and server code are never served to browsers.

### Refer & earn: 5 referrals = 1 free meal
- Every customer gets a referral code and a share link (`/customer/?ref=CODE`). The **Refer & earn** tab shows:
  - the code, with WhatsApp, share and copy buttons
  - 5-paw progress towards the next free meal
  - a friends list
- A friend counts once **their first order is delivered**. Sign-ups alone don't count, which prevents fake sign-ups.
- Every 5 qualified friends earns **1 free meal**: one meal bowl, up to ₹300. It's applied with a switch at checkout. If the order is cancelled, the meal is returned.
- **Admin → Referrals**: totals, top referrers, referred customers, and a **+1 meal** button for goodwill.
- **Admin → Settings**: change how many friends are needed and the value cap.

### "Before you order" (cart)
- 💬 **Comment** for the kitchen
- 🎯 **Customization**: Mashed, Chunky, Boneless only, Extra protein, Less carbs, Grain-free, Less ghee, Serve lukewarm, plus free text
- ✨ **Any special request**
- ⚠️ **Any allergies**: pre-filled from the pet's profile, plus free text

These show on the admin order card, at rider pickup (special requests and comments also show at drop-off) and on the customer's tracking screen.

## Project layout

```
server.js            HTTP server: static files + /api
server/api.js        email/password auth, sessions, role-filtered state, RPC, live events
server/passwords.js  password hashing and account helpers
shared/auth-ui.js    login / sign-up / forgot / change-password screens used by all three apps
server/actions.js    every state change, with validation and permissions (orders, referrals, menus…)
server/db.js         SQLite document store (JSON-file fallback)
server/seed.js       sample data
shared/logic.js      pricing, weeks and constants, shared by the server and browsers
shared/store.js      browser data layer (FP.api.db, FP.api.call, FP.api.auth)
shared/ui.js, brand.css
customer/ rider/ admin/
```

## Before going live

- **Password-reset emails**: connect an email provider in `sendEmail()` and run with `EMAIL_MODE=live`.
- **Payments**: connect Razorpay for UPI and cards. Payment is simulated for now.
- **Hosting**: run on a server or VPS behind HTTPS (e.g. Caddy or Nginx), and back up `data/foodpeto.db`. For many kitchens or cities, move to Postgres. Only `server/db.js` would change.
- **Apps**: the customer and partner apps are mobile-first web apps. Package them for the Play Store / App Store with Capacitor if needed.
- **Real content**: replace the placeholder prices, plan prices and food illustrations.
#   F o o d P e t o - a p p  
 #   F o o d P e t o - a p p  
 #   F o o d P e t o - a p p  
 