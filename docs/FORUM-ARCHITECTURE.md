# LocalProof Community Forum — architecture & step-by-step build

The forum is LocalProof's **living community layer** — the ChineseInLA message board reimagined:
neighbors, trainers, coaches, instructors, boba owners, Airbnb hosts and car dealers post,
ask, answer, review each other, and build reputation. Everything is **auditable in Supabase**,
and business owners can pay monthly for a **Verified badge + promotion**.

This doc is the map. We build in phases; each phase is small and testable, like the news and
business-directory verticals we already shipped.

---

## 1. What it does (the feature set)

- **Boards & threads** — categories (Muay Thai & Combat, Baseball & Youth Sports, Pilates & Fitness, Boba & Food, Rentals & Airbnb, Autos & Dealers, Newcomers, Housing, Jobs…). Each has threads; threads have replies. Questions can have an **accepted answer**.
- **Reviews with rich snippets** — members review businesses, products, and each other (1–5 stars + text). These emit **schema.org Review / AggregateRating** JSON-LD so Google can show star ratings in results (the SEO/GEO play).
- **Clickable, explorable profiles** — every user has a public profile with tabs (Posts / Replies / Reviews / Business), reputation, roles/tags, and a **"fancy" customizable** cover + bio.
- **Engagement** — upvotes/helpful marks, follows, @mentions, "ask the community."
- **Verified badge (paid)** — business owners subscribe monthly to get a Verified badge, a promoted profile, and business-listing tie-in.
- **Fully auditable** — every create / edit / delete / moderate action is written to an append-only audit log, and edits keep a revision history.
- **Moderated & safe** — same staff queue pattern we built for posts/news; public sees only approved content.

---

## 2. Data model (Supabase, all `lp_`-prefixed, additive to what exists)

Builds on the tables already live (`lp_businesses`, `lp_posts`, `lp_news`, `lp_business_members`,
`lp_audit_events`, `lp_staff_roles`). New tables:

| Table | Purpose |
|---|---|
| `lp_profiles` | Public profile per user: handle, display name, avatar, cover, bio, city/county, role tags (trainer/coach/host/dealer…), is_business, links, theme, reputation. |
| `lp_forum_categories` | Boards: slug, name, icon, blurb, county, sort_order, is_active. |
| `lp_threads` | A thread: category, author, title, body, county, is_question, accepted_post_id, pinned, view_count, reply_count, last_activity_at, publish_status, moderation_status. |
| `lp_thread_posts` | Replies to a thread: thread_id, author, body, parent_post_id (for nesting), is_accepted, publish/moderation status, edited_at. |
| `lp_reviews` | subject_type (`user`/`business`/`product`) + subject_id, rating 1–5, title, body, verified_transaction, publish/moderation status. Powers rich snippets. |
| `lp_post_votes` | Upvotes / "helpful" on posts and reviews (voter, target_type, target_id). |
| `lp_follows` | Follower → followed (users or businesses). |
| `lp_thread_revisions` / `lp_post_edits` | Edit history for threads/replies (auditable diffs). |
| `lp_subscriptions` | Paid tiers: user_id, tier (`verified_pro`), status, current_period_end, provider ids (Stripe). Drives the Verified badge. |

**Auditability** (the requirement): a shared trigger writes to `lp_audit_events` on every insert/
update/delete of threads, posts, reviews, profiles, and subscriptions — actor, action, entity,
before/after, timestamp. Append-only (no update/delete on the audit table). Edits also snapshot
into the revision tables, so you can always see *who changed what, when, and from what to what*.

**RLS** (same shape as everything we've built): public reads only `published + approved`; authors
insert/edit **their own** rows (edits logged); staff (`lp_is_staff`) moderate and read everything.

---

## 3. Monetization (baked into the model)

- **Verified Pro (subscription)** — monthly fee → Verified badge, promoted/searchable profile, business-listing link, "Pro" flair on posts. `lp_subscriptions` + Stripe. This is the core recurring revenue.
- **Promoted threads / pinned posts** — pay to pin a listing or announcement in a board.
- **Featured business review placement** — a business boosts a strong review into the spotlight (labeled).
- **Lead capture** — "Request a quote / contact" on pro profiles → charge per lead or bundle into Pro.
- **Sponsored boards** — a local sponsor backs a category (labeled).

Because posting is moderated and reviews are provenance-tagged, the *quality* stays high — which is
exactly what lets you charge for placement without it turning into spam.

---

## 4. Step-by-step phases (each ships + tests on its own)

- **Phase 0 — Design (now).** The cinematic "visor-open → Commons" entrance + board layout, as a self-contained prototype. Nail the look and the interaction model before any backend. *(delivered with this doc)*
- **Phase 1 — Schema + audit + RLS.** Create the tables above, the audit triggers, revision history, and RLS. Verify end-to-end like we did for the accounts backend.
- **Phase 2 — Read-only forum.** Categories → thread list → thread view, reading live from Supabase, OC-scoped (LA stays seed). Reuses the live-adapter pattern from news/businesses.
- **Phase 3 — Posting + moderation.** Signed-in users create threads and replies (draft→submit→approved), edits logged. Staff moderation queue (reuse what's built).
- **Phase 4 — Reviews + rich snippets.** Review composer + display, schema.org Review/AggregateRating JSON-LD on business and profile pages (the Google-stars SEO win).
- **Phase 5 — Profiles + reputation.** The fancy, explorable profile (cover, tabs, tags, reputation from upvotes/accepted answers), follows, @mentions.
- **Phase 6 — Verified Pro (paid).** Stripe subscription → Verified badge + promotion. Billing webhook writes `lp_subscriptions`; badge shows across the forum.

Design (the visor entrance, HUD flourishes) is a layer that rides on top of every phase.

---

## 5. Design concept (Phase 0) — "The Gate & The Commons"

- **The Gate:** a dark, cinematic full-screen portal. A helmet **visor** (two metal plates) sits closed over a glowing LocalProof core, HUD ring slowly turning, seam pulsing. One button: **Enter the Commons**.
- **The Opening:** click → the visor plates part (up/down), the core flares, the dark gate dissolves — and you step through into…
- **The Commons:** a bright, warm, on-brand civic board — category cards, hot threads, a Verified-member spotlight rail, and a featured review snippet. Clicking a category opens a thread list; clicking a member opens their profile card.

The contrast is the point: **dramatic threshold → welcoming community.** It's memorable (shareable),
but the actual working surface stays clean, fast, and readable — a place people want to spend time.

See `forum-prototype.html` for the working design.
