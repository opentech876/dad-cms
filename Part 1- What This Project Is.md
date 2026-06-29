Excellent. After digging through the dump, I'm now confident enough to produce what I'd call a **technical takeover document** rather than a simple code review.

---

# PART 1 — WHAT THIS SYSTEM REALLY IS

Most developers opening this repository will think:

> "This is an Angular app with Supabase."

That's technically true.

But architecturally, this is actually:

```text
EDITORIAL ERP
+
ADVERTISING SCHEDULER
+
MULTI-TENANT CMS
+
ROLE MANAGEMENT PLATFORM
```

for the **Day After Day** ecosystem. 

The app is not content-centric.

It is **calendar-centric**.

That distinction affects every architectural decision.

---

# PART 2 — CORE BUSINESS MODEL

The real business object isn't an event.

The real business object is:

```text
CALENDAR DAY SLOT
```

Everything revolves around filling those slots.

---

## Editorial Workflow

Editor creates:

```text
Historical Event
```

Example:

```text
15 August 1960
Independence of Congo
```

Stored in:

```text
events
```

Then:

```text
Calendar 2027
      ↓
08-15
      ↓
Position 1
      ↓
Historical Event
```

Stored in:

```text
calendar_entries
```

This is why the architecture uses:

```ts
mmdd
```

instead of:

```ts
date
```

The same historical event can be reused every year. 

---

# PART 3 — FRONTEND ARCHITECTURE

The frontend follows:

```text
src/
 ├── core/
 ├── features/
 ├── models/
 └── app.*
```

---

## app.ts

Root component.

Purpose:

```text
Application bootstrap only.
```

Contains almost no business logic.

Responsibilities:

* Create Angular root
* Host router outlet
* Host Taiga UI root

Extremely thin.

Good design.

---

## app.html

```html
<tui-root>
  <router-outlet />
</tui-root>
```

Purpose:

Provide:

```text
Global overlays
Dialogs
Notifications
Router rendering
```

---

## app.config.ts

Global dependency registration. 

Registers:

```text
Router
HTTP
Taiga UI
French locale
Global error handler
```

This is effectively Angular's composition root.

---

# PART 4 — ROUTING SYSTEM

One of the cleanest areas of the codebase.

Routes reveal almost the entire business model. 

---

## Public

```text
/
```

Landing page.

---

```text
/demarrer
```

Start onboarding.

---

```text
/verifier
```

OTP verification.

---

```text
/login
```

Authentication.

---

# Workspace Creation

```text
/espaces
```

Special route.

Only authenticated users can access.

Cannot be protected by onboardingGuard because onboarding itself creates the workspace. 

This is a subtle but correct design choice.

---

# Protected Shell

Everything else sits inside:

```text
ShellComponent
```

Protected by:

```text
authGuard
+
onboardingGuard
```



---

# PART 5 — SECURITY MODEL

There are 3 layers.

---

## Layer 1

authGuard

Checks:

```text
Valid Supabase session?
```

Nothing else. 

---

## Layer 2

onboardingGuard

Checks:

```text
Owner?
Workspace exists?
```

If owner has no workspace:

```text
redirect → /espaces
```

This forces platform initialization.

---

## Layer 3

roleGuard

Checks permissions. 

Roles:

```ts
owner
chef_equipe
editeur
charge_communication
```



---

# PART 6 — AUTHENTICATION SYSTEM

Authentication is passwordless.

Flow:

```text
Email
 ↓
OTP
 ↓
Session
```

No passwords.

---

## AuthService

This service is more important than it appears.

Responsibilities:

### User session

```ts
currentUser$
currentSession$
```

---

### Role management

Maintains:

```ts
BehaviorSubject<AppRole>
```

Role cache.

---

### Permission hierarchy

Interesting logic:

```text
owner
 └─ everything

chef_equipe
 ├─ editeur
 └─ charge_communication
```

Meaning:

Team managers inherit both editorial and communication permissions.

This hierarchy is hardcoded client-side.

Potential future issue:

```text
Permission model duplicated
Frontend
+
Database
```

Risk of drift.

---

# PART 7 — MULTI-TENANCY

This is arguably the most important subsystem.

---

## WorkspaceContextService

Stores:

```ts
dad-workspace-id
```

inside localStorage. 

Purpose:

```text
Current tenant selection
```

---

Every major service reads:

```ts
activeWorkspaceId()
```

before querying.

Example:

CalendarService:

```ts
eq('workspace_id', wsId)
```



---

Meaning:

```text
Workspace A
never sees
Workspace B
```

assuming RLS is also correct.

---

# PART 8 — DOMAIN SERVICES

These services contain the actual business logic.

---

## CalendarService

Purpose:

Manage calendar containers.

Operations:

```text
listCalendars()
createCalendar()
updateCalendar()
deleteCalendar()
```



---

Interesting observations:

### Soft Delete

No record is physically removed.

Instead:

```ts
deleted_at
deleted_by
```

This is excellent.

---

### Audit Tracking

Updates include:

```ts
updated_by
```

Deletion includes:

```ts
deleted_by
```

Good accountability.

---

## CalendarEntryService

Purpose:

Assign historical events into calendar slots. 

This is the service that actually powers editorial scheduling.

---

Important methods:

### getEntriesByMmdd

Shows occupancy.

Example:

```text
08-15
```

across calendars.

Used to prevent conflicts.

---

### assignEvent

Core scheduling operation.

Creates:

```text
calendar
+
mmdd
+
position
+
event
```

relationship.

---

### unassign

Removes assignment.

---

# PART 9 — EVENT LIBRARY

The event library is much larger than it first appears.

---

## EventService

Responsibilities likely include:

```text
Create event
Edit event
Delete event
Upload image
Search
Pagination
Import
```

Evidence from tests and UI.  

---

## Hidden Major Feature

Excel Import

Found inside:

```text
events.component.ts
```

Uses:

```ts
XLSX
```

library. 

This is a big feature.

Editors can bulk-import historical events.

Meaning the system was designed for large datasets.

---

# PART 10 — ADVERTISING SUBSYSTEM

Routes:

```text
/campagnes
```

Restricted to:

```text
owner
chef_equipe
charge_communication
```



---

This indicates:

Editorial staff should not manage advertisements.

Good separation of concerns.

---

Architecture likely:

```text
Campaign
 ↓
Assignment
 ↓
Calendar
 ↓
Display in mobile app
```

---

# PART 11 — USER MANAGEMENT

One of the more mature parts.

---

## Users Page

Owner only.

```text
/utilisateurs
```



---

Backed by Edge Functions.

Found:

```text
list-users
manage-user
invite-user
```

---

Interesting discovery:

User management is NOT done via normal frontend CRUD.

Instead:

```text
Angular
 ↓
Supabase Edge Function
 ↓
Service Role
 ↓
Auth Admin API
```

This is the correct way.

---

Example actions:

```text
Update role
Block
Unblock
Delete
```



---

# PART 12 — DATABASE ARCHITECTURE

The migration history reveals the evolution.

---

## Initial Schema

Contains:

```text
workspaces
profiles
user_roles
calendars
events
calendar_entries
campaigns
...
```



---

## Later Additions

### Audit

```text
audit_columns
audit_log
```

---

### Security

```text
workspace_isolation
fix_calendar_entries_rls
```

---

### Analytics

```text
metrics_rpcs
```

---

This suggests the team discovered and fixed tenancy issues after initial development.

A very common SaaS evolution.

---

# PART 13 — METRICS SYSTEM

Surprisingly advanced.

---

## Device Metrics

Tracks:

```text
Android devices
iOS devices
Registrations
```

---

## Operational Metrics

Tracks:

```text
Permission grants
Push token registration
```

---

## Editorial Metrics

Tracks:

```text
CMS activity
Calendar completion
```

---

## Revenue Metrics

Tracks:

```text
Campaign taps
```

Ad click-through data.



---

# PART 14 — NOTIFICATION SYSTEM

Very clean relational design.

---

Tables:

```text
notifications
notification_reads
```

---

Instead of:

```text
notification.read = true
```

the system creates:

```text
notification_reads
```

records.

Benefits:

```text
Same notification
Multiple users
Independent read states
```

Excellent design.

---

# PART 15 — BIGGEST TECHNICAL DEBT I SEE

## 1. Silent Failures

Many services do:

```ts
if(error) return []
```

instead of throwing.

Example:

Calendar services.

This hides production incidents.  

---

## 2. Workspace State In LocalStorage

No validation at startup.

Potential stale tenant issue.

---

## 3. Authorization Logic Exists In Multiple Places

Permissions exist:

```text
Angular
Edge Functions
Database
```

Three sources of truth.

Long-term maintenance risk.

---

## 4. Large Components

Events module appears to be becoming a "God Component."

Evidence:

```text
Import
Calendar linking
Occupancy checking
Bulk operations
Search
CRUD
```

all inside the same feature. 

---

# My Current Assessment

If I were taking over this project tomorrow, I would rate it:

| Area                  | Score    |
| --------------------- | -------- |
| Architecture          | 8.5/10   |
| Security              | 8/10     |
| Multi-tenancy         | 8.5/10   |
| Frontend organization | 8/10     |
| Test coverage         | 8/10     |
| Maintainability       | 7.5/10   |
| Technical debt        | Moderate |
| Overall maturity      | 8/10     |

This is not a junior project.

It looks like a system that has already gone through several production iterations and accumulated real-world features, audit requirements, tenancy isolation, onboarding, analytics, and role management.

The next deep-dive should focus on the **database schema, RLS policies, Edge Functions, and every feature component individually**, because that's where the remaining 10–20% of business logic is hidden.
