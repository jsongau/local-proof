# LocalProof — Business Accounts & Admin Dashboard (spec + build options)

The next capability: let **businesses create accounts and upload their own posts**
(listings, services, offers, deals), and give **the platform** the tools to moderate,
verify, and monetize them. This is two dashboards, not one.

---

## 1. The two sides

### A) Business self-serve portal (customer-facing, multi-tenant)
What a business owner can do after signing up:
- **Sign up / claim** an existing (e.g. OSM-sourced or CoverCapy) listing → verify ownership.
- **Create & edit posts** across verticals: service listing, rental, job, marketplace item, deal, verified offer.
- **Manage their profile**: services, fees, hours, photos, service area, languages.
- **Respond** to reviews and community questions; **receive** leads / quote requests.
- **Buy promotion**: sponsored listing / homepage placement (labeled), see basic analytics (views, leads).
- Everything they submit enters a **moderation queue** before going live.

### B) Platform admin dashboard (internal, staff-only)
What LocalProof staff / moderators do:
- **Moderation queue**: approve / reject / flag pending posts, edits, reviews, claims.
- **Verify claims & evidence**: confirm ownership, license, transaction → issue dated badges.
- **Ads & sponsorship**: create/label placements, set dates, review sponsored listings, billing status.
- **Reports & disputes**: handle scam/inaccuracy reports, review-provenance disputes.
- **Taxonomy & geography**: categories, cities/counties, featured slots.
- **Analytics**: signups, active listings, leads, revenue, moderation SLA.
- **User/role management**: promote moderators, suspend bad actors, audit log.

---

## 2. Data & roles (already modeled)

The v6 schema + CoverCapy patterns already have the primitives:
- **Roles**: `user_role` enum = `member | business_owner | moderator | admin` (v6 doc 32).
- **Moderation**: `moderation_status` = `unreviewed | approved | flagged | rejected` on every postable table.
- **Publish state**: `publish_status` = `draft | pending | published | paused | expired | removed`.
- **Claims/verification**: provider claims + verification_requests (CoverCapy has `dentist_claims`, `verification_requests`, `claim_tokens`).
- **RLS**: business owners can only edit their own rows (`owner_id = auth.uid()`); moderators/admins bypass via role; public reads only `published + approved`.

So the dashboard work is mostly **UI over existing tables + RLS**, not new modeling.

---

## 3. Build vs buy — the realistic split

- **Internal admin / moderation** → *buy/adopt a tool*. This is classic CRUD + queues over
  Postgres; a low-code admin panel gets you there in days, not weeks. Candidates: Retool,
  Refine, React-Admin, Directus, Forest Admin, Appsmith/Budibase/ToolJet, Supabase Studio (basic).
- **Business self-serve portal** → *build in the app* (Next.js), because it's branded,
  customer-facing, and tied to your posting flows. Can be scaffolded fast with **Refine** or
  **React-Admin** (both have Supabase adapters), or hand-built with shadcn/Tremor components.

Recommended starting point to evaluate: **Refine** (open-source React framework, Supabase
adapter, does both internal admin *and* customer apps, RBAC) vs **Retool** (fastest internal
admin, low-code, paid) vs **Directus** (instant admin + REST/GraphQL over your Postgres, self-host free).

---

## 4. Evaluation criteria (what "good for this" means)
1. **Supabase/Postgres-native** (reads your existing tables + RLS, respects auth).
2. **RBAC** (business_owner vs moderator vs admin) and **row-level ownership**.
3. **Moderation workflow** (queues, approve/reject, bulk actions, audit log).
4. **Multi-tenant self-serve** (each business sees only its own data) *and* internal admin — ideally one stack for both, or a clean split.
5. **Extensible UI** (custom forms for each vertical's post type).
6. **Cost & licensing** (open-source/self-host vs per-seat SaaS) and **data ownership** (no lock-in).
7. **Auth integration** (Supabase Auth / magic links / SSO).
8. **Speed to first working version.**

---

## 5. Research prompt (paste into a research tool / another AI)

> Research and compare admin-dashboard and internal-tool platforms for a two-sided local
> marketplace built on **Supabase (Postgres + Auth + RLS)** with a **Next.js** front end.
> I need to support two things: (1) a **business self-serve portal** where local businesses
> sign up, claim/verify a listing, and create & edit their own posts (service listings,
> rentals, jobs, marketplace items, deals, offers) that enter a moderation queue; and (2) an
> **internal admin/moderation dashboard** for staff to approve/reject posts, verify business
> claims and issue badges, manage labeled ad/sponsorship placements, handle scam/dispute
> reports, and view analytics.
>
> Compare these options (add any I'm missing): **Retool, Refine, React-Admin (ra-supabase),
> Directus, Forest Admin, Appsmith, Budibase, ToolJet, Strapi, Payload CMS, Supabase Studio,
> and building custom with shadcn/ui + Tremor.**
>
> For each, evaluate: native Supabase/Postgres integration and whether it respects RLS;
> role-based access control (business_owner vs moderator vs admin) and per-row ownership;
> built-in moderation/approval-queue workflows and audit logging; ability to serve BOTH a
> multi-tenant customer-facing portal AND an internal admin (or whether I'd need two tools);
> customizability of forms per post type; open-source vs proprietary, self-host vs SaaS, and
> real pricing at ~10 staff seats + thousands of business accounts; auth integration with
> Supabase Auth; and realistic time-to-first-working-version.
>
> Deliver: (a) a comparison table across those criteria, (b) a clear recommendation for the
> internal admin tool, (c) a separate recommendation for the business self-serve portal
> (build vs adopt), (d) any gotchas with RLS + these tools, and (e) a 2–3 week implementation
> outline for the recommended stack. Cite current sources and note anything that changed recently.

---

## 6. My quick take (pending the research)
- **Internal admin/moderation:** start with **Retool** (fastest to a working moderation queue
  over Supabase) *or* **Directus** if you want free/self-hosted and an instant API too.
- **Business self-serve:** **build it in the Next.js app** (branded), scaffolded with **Refine +
  its Supabase adapter** so you get auth, RBAC, and CRUD forms without reinventing them.
- Either way the heavy lifting is already done in the schema — this is UI + RLS policy, not a rebuild.
