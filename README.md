# LAZIZ Business Management — inventory alerts and cloud setup pack

## Website files
- `index.html` — public LAZIZ site, business dashboard, catalogue, sales, reports, alerts and stock history.
- `offline-pos.html` — separate cashier sales counter.
- `supabase/schema.sql` — starter PostgreSQL schema with business separation, owner/manager/cashier roles, product catalogue, sales, stock movements, expenses, customers, suppliers and refunds. Row Level Security is enabled.
- `supabase/config.example.js` — safe placeholder showing where credentials go.
- `supabase-config.js` — configured with the Project URL and publishable key supplied by the owner; loaded by both pages.

## Changes in this revision
- A separate notification page and visible alert pop-ups for products at or below their own reorder level.
- Each product requires its own low-stock alert quantity when created or edited. Example: cement alert at 5 bags; iron rod alert at 10 pieces.
- Low-stock alerts are checked after sales and when the owner opens the dashboard. The offline cashier also displays a low-stock warning after checkout.
- Stock movement history records opening stock, adjustments, sales and customer returns.
- Full-sale refund action in sales history restores returned quantities to stock and records a stock movement. This is a basic full refund workflow, not a payment-gateway refund.
- Sales history shows each transaction's subtotal, manual discount, and final balance paid; it also totals discounts given. Daily reports remain available. New business catalogues start empty; owners enter their actual goods and prices.
- Offline POS sale line items now retain product IDs so returns can be associated with the original products.

## Important: not yet a live cloud-connected production system
This pack is still a front-end/local-browser build plus a Supabase database foundation. The current website login and operational screens still use browser `localStorage`. The Supabase public project configuration is now added to both pages. However, the SQL schema has not yet been run, cloud data operations have not been implemented, and the cashier/owner role screens have not yet been wired to Supabase Auth. Therefore:
- Same browser and same published origin: the existing local prototype can share local data.
- Different devices or different staff logins: they do not yet share live stock.
- Offline sales: they remain on the cashier device; they are not yet safely uploaded to the cloud.
- Do not use this prototype for live business transactions until the Supabase Auth, secure transaction RPC, offline queue/idempotency, sync conflict handling, and end-to-end tests are completed.

## Step-by-step setup (we will do this together)

### A. Create the Supabase project
1. Open https://supabase.com and create/sign in to your account.
2. Choose **New project**, create an organization if asked, and name the project `LAZIZ`.
3. Choose a strong database password and keep it private. Do not send it in chat.
4. Select a region close to your business users (for Nigeria, choose the nearest available region).
5. Wait for the project to finish provisioning.
6. In Project Settings → API, copy the **Project URL** and the **publishable/anon key**. Never copy or share the `service_role` secret key.

### B. Create the database tables
1. In the Supabase dashboard, open **SQL Editor**.
2. Choose **New query**.
3. Open `supabase/schema.sql` from this package, copy all its SQL, and paste it into the editor.
4. Click **Run** and check that it completes without errors.
5. In Authentication → Providers, enable Email. Configure email confirmation and password rules before real use.

### C. Publish the front-end files on GitHub Pages
1. Sign in at https://github.com.
2. Create a new repository named `laziz-business-system`.
3. Upload `index.html`, `offline-pos.html`, the `supabase` folder, and this `README.md` to the repository root (not inside another nested folder).
4. Open repository Settings → Pages.
5. Under Build and deployment, choose **Deploy from a branch**, select `main` and `/(root)`, then Save.
6. GitHub will show the public website address after deployment.

### D. Connect and test before launch
The current JavaScript still needs the Supabase integration pass. Next, run `supabase/schema.sql` in the Supabase SQL Editor. After that, the application still needs Supabase Auth, business-scoped queries, atomic sale/refund functions, and an offline retry queue with unique transaction IDs before cloud sync can work. We must test that an offline sale reduces cloud stock exactly once after reconnection, even if the cashier taps PAID twice or the network drops mid-sync.

## Security reminders
- Never put a database password or `service_role` key in HTML, JavaScript, GitHub, or chat.
- Only the public publishable/anon key belongs in browser code, and only with Row Level Security correctly configured.
- The SQL schema is a foundation, not a substitute for a security review or end-to-end testing.


## Manual member/customer discounts
Both the main website POS and the separate cashier screen include a manual discount amount in Nigerian naira. The cashier enters the amount to deduct; LAZIZ displays subtotal, discount, and balance to pay separately. The sale record and receipt preserve all three amounts, and the online sales history displays the discount. Discounts are not automatically calculated as a membership percentage; configure a policy only after the business owner decides the rule. The Supabase `sales.discount` column stores the amount.
