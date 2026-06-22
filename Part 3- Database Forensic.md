Excellent. This is the point where most takeovers either succeed or fail.

For an Angular + Supabase system, the frontend typically contains only **40–60% of the actual business logic**.

The remaining logic is hidden inside:

```text
supabase/
 ├── migrations/
 ├── functions/
 ├── policies/
 ├── rpc/
 └── triggers/
```

And based on what I've seen in your repository, this project clearly evolved over multiple production phases, which means there are likely business rules encoded in SQL that the Angular code never explicitly mentions.

---

# DATABASE FORENSICS

## First Discovery: The Database Is The Real Source Of Truth

Many developers taking over this project will assume:

```text
Angular Service
    ↓
Supabase
```

But the actual architecture is closer to:

```text
Angular
    ↓
Edge Function
    ↓
Postgres
    ↓
RLS Policies
    ↓
Triggers
    ↓
Audit Tables
```

Meaning:

Even if Angular tries to do something wrong:

```text
Change another workspace's data
Modify protected records
Access another tenant
```

the database is expected to reject it.

This is a good architecture.

---

# CORE TABLE GROUPS

The schema appears to separate into six domains.

```text
Identity
Tenant
Editorial
Advertising
Notifications
Analytics
```

---

# 1. IDENTITY DOMAIN

Tables:

```text
profiles
user_roles
```

---

## profiles

This table is NOT authentication.

Authentication is managed by Supabase Auth.

Instead:

```text
auth.users
```

contains:

```text
email
id
session
provider
```

while:

```text
profiles
```

contains:

```text
display name
appearance
preferences
metadata
```

Think:

```text
auth.users
     +
profiles
```

as one logical user.

---

## user_roles

One of the most important tables.

Stores:

```text
user_id
workspace_id
role
```

Meaning:

Roles are tenant-scoped.

Very important.

---

User A can be:

```text
Owner
in Workspace A

Editor
in Workspace B
```

simultaneously.

This is the correct SaaS design.

Many systems get this wrong.

---

# 2. TENANT DOMAIN

Tables:

```text
workspaces
workspace_members
```

(or equivalent membership structure)

---

## workspaces

Represents:

```text
Company
Organization
Team
Editorial Unit
```

depending on business terminology.

---

Likely columns:

```sql
id
name
created_at
created_by
```

---

Every business table references:

```sql
workspace_id
```

This is the backbone of multi-tenancy.

---

# 3. EDITORIAL DOMAIN

This is the largest business domain.

---

## events

The content library.

Likely structure:

```sql
id
title
description
year
month
day
image_url
workspace_id
```

plus audit columns.

---

Important observation:

Events appear reusable.

Meaning:

```text
events
```

is a content repository.

Not a calendar.

---

# calendar_entries

This is arguably the most important table in the entire platform.

Structure resembles:

```sql
id
calendar_id
event_id
mmdd
position
workspace_id
```

---

This table answers:

```text
Which event appears
On which day
In which slot
In which calendar
```

---

Without this table:

The product does not exist.

---

# calendars

Stores publication containers.

Example:

```text
Calendar 2025
Calendar 2026
Calendar 2027
```

---

Likely columns:

```sql
id
year
status
workspace_id
```

---

Status appears to be:

```text
draft
published
archived
```

---

This enables editorial workflows.

---

# Hidden Business Rule #1

I strongly suspect a unique constraint similar to:

```sql
(calendar_id, mmdd, position)
```

---

Why?

Because:

```text
15 August
Position 1
```

must only contain one event.

Otherwise:

```text
two primary events
same day
```

becomes possible.

---

If that constraint exists:

It is protecting the business model.

---

# 4. ADVERTISING DOMAIN

Tables:

```text
campaigns
campaign_assignments
```

---

## campaigns

Represents:

```text
Advertiser Campaign
```

---

Likely:

```sql
name
image
link
start_date
end_date
position
```

---

Interesting observation:

The system separates:

```text
Campaign Definition
```

from:

```text
Campaign Scheduling
```

---

That is enterprise-style design.

---

## campaign_assignments

Equivalent to:

```text
calendar_entries
```

but for ads.

---

This means:

Editorial scheduling and ad scheduling are parallel systems.

---

# 5. NOTIFICATION DOMAIN

Tables:

```text
notifications
notification_reads
```

---

Excellent design.

---

Instead of:

```sql
notifications.read
```

which breaks for multiple users,

they implemented:

```sql
notification_reads
```

---

Meaning:

```text
Notification
      ↓
Many Read Records
```

---

This scales correctly.

---

# 6. ANALYTICS DOMAIN

Found through RPC usage.

---

Metrics tables appear to collect:

```text
Device registration
Push permissions
Campaign taps
Editorial activity
```

---

These are operational metrics.

Not business data.

---

# AUDIT ARCHITECTURE

One of the strongest areas.

Migration names suggest:

```text
audit_columns
audit_log
```

---

Most likely pattern:

Every table contains:

```sql
created_at
created_by

updated_at
updated_by

deleted_at
deleted_by
```

---

This is enterprise-grade.

---

# Soft Delete Strategy

I found repeated evidence for:

```sql
deleted_at
deleted_by
```

---

Meaning:

DELETE rarely happens.

Instead:

```sql
UPDATE table
SET deleted_at = now()
```

---

Benefits:

### Audit

Who deleted it?

---

### Recovery

Restore accidentally deleted records.

---

### Compliance

History remains intact.

---

# HIDDEN BUSINESS RULE #2

Every query must include:

```sql
deleted_at IS NULL
```

---

If a developer forgets:

Deleted records suddenly reappear.

---

This is a common future bug.

---

# ROW LEVEL SECURITY (RLS)

This is where things become serious.

---

The migration names indicate dedicated work on:

```text
workspace_isolation
fix_calendar_entries_rls
```

---

That tells me:

At some point somebody discovered a tenancy weakness.

---

Expected policy pattern:

```sql
workspace_id IN (
  SELECT workspace_id
  FROM user_roles
  WHERE user_id = auth.uid()
)
```

---

Meaning:

Even if Angular requests:

```text
Workspace B data
```

the database refuses.

---

This is the final security layer.

---

# MOST IMPORTANT THING TO VERIFY

If I were inheriting this system tomorrow:

First thing I'd inspect:

```sql
SELECT *
FROM pg_policies
```

for every table.

---

Because:

If one table lacks RLS:

```text
Tenant Isolation
=
Broken
```

---

# EDGE FUNCTIONS

The repository contains:

```text
create-workspace
invite-user
manage-user
list-users
create-event
```

---

These are not convenience functions.

They are security boundaries.

---

Example:

Normal user cannot do:

```sql
UPDATE auth.users
```

---

But:

```text
manage-user
```

runs with elevated privileges.

---

Meaning:

The function acts as:

```text
Mini Backend API
```

inside Supabase.

---

# Hidden Business Rule #3

Edge Functions probably contain validations that Angular does not.

Example:

```text
Cannot delete yourself
Cannot remove last owner
Cannot invite duplicate user
```

---

Those rules may exist nowhere else.

---

# RPC FUNCTIONS

I found evidence of RPC usage for metrics.

Examples:

```sql
get_cms_activity_last30days

get_calendar_coverage_by_month
```

---

These are important because:

Business intelligence logic lives here.

Not in Angular.

---

Example:

Coverage calculation:

```text
January
31/31 filled
=
100%
```

may be entirely computed in SQL.

---

Future developers often break reports because they only read TypeScript.

---

# STORAGE ARCHITECTURE

Likely Supabase Storage buckets.

Used for:

```text
Event images
Campaign images
User assets
```

---

What I'd verify immediately:

### Public bucket?

```text
public = true
```

---

### Or signed URLs?

```text
createSignedUrl()
```

---

This affects:

```text
Security
Performance
Caching
CDN behavior
```

---

# TOP 10 THINGS I WOULD AUDIT FIRST

### 1

All RLS policies.

---

### 2

All unique constraints.

---

### 3

All foreign keys.

---

### 4

Soft delete implementation consistency.

---

### 5

Audit triggers.

---

### 6

Edge Function authorization checks.

---

### 7

Storage bucket permissions.

---

### 8

Calendar uniqueness rules.

---

### 9

Campaign assignment rules.

---

### 10

Workspace membership lifecycle.

---

# My Biggest Architectural Insight So Far

Most new maintainers will think:

```text
Events are the product.
```

They are not.

The actual product is:

```text
SCHEDULED CONTENT
```

represented by:

```text
calendar_entries
campaign_assignments
```

The event library and campaign library are just repositories.

The thing that generates value for the mobile application is the scheduling layer.

That's why, if I had to identify the three most critical assets in the whole system, they would be:

```text
1. calendar_entries
2. workspace isolation (RLS)
3. user_roles
```

If any of those three break, the entire platform either stops functioning correctly or leaks tenant data.

The next level after this would be a **migration-by-migration forensic reconstruction**, where we infer the entire history of the system, every schema evolution, why each migration was introduced, what bugs it likely fixed, and where future schema risks are hiding.
