Perfect. Now we're entering the layer that usually determines whether a future rewrite succeeds or fails:

# Deep Dive #2 — Internal Mechanics & Hidden Architecture

After reviewing the dump further, I think the most important thing for a takeover developer is understanding that there are actually **three systems intertwined together**:

```text
SYSTEM A
Editorial Library

SYSTEM B
Calendar Scheduler

SYSTEM C
Advertising Scheduler
```

Most bugs will come from the interactions between those systems, not from the individual CRUD screens.

------

# 1. DATABASE MENTAL MODEL

If I had to redraw the schema from memory, it looks roughly like:

```text
workspaces
    │
    ├──────── profiles
    │
    ├──────── user_roles
    │
    ├──────── calendars
    │             │
    │             └──── calendar_entries
    │                         │
    │                         └──── events
    │
    ├──────── campaigns
    │             │
    │             └──── campaign_assignments
    │
    ├──────── notifications
    │
    └──────── metrics tables
```

The important thing is:

**events do not belong to calendars.**

They are independent library items.

Calendars only reference them later through assignments.

That design choice enables:

```text
One event
used in many calendars
```

without duplication.

------

# 2. THE REAL HEART OF THE SYSTEM

Many developers would assume:

```text
EventService
```

is the center.

It isn't.

The actual heart is:

```text
CalendarEntryService
```

Why?

Because that's where content becomes visible to the end user.

------

## Event Lifecycle

### Stage 1

Create event.

```text
events
```

Example:

```text
15 August 1960
Independence of Congo
```

Stored only in the library.

------

### Stage 2

Assign event.

```text
calendar_entries
```

Created through:

```ts
assignEvent()
```

inside CalendarEntryService.

Now it becomes:

```text
Calendar 2027
08-15
Position 1
→ Independence of Congo
```

------

### Stage 3

Publish calendar.

Calendar status changes:

```text
draft
→
published
```

Now mobile apps can consume it.

------

# 3. WHY MM-DD EXISTS

This is one of the most elegant decisions in the project.

The system stores:

```text
08-15
```

instead of:

```text
2027-08-15
```

inside assignments.

You see evidence everywhere:

```ts
getEntriesByMmdd(mmdd)
```



and

```ts
_loadDayModalEvents(mmdd)
```



------

Reason:

Historical anniversaries repeat every year.

Example:

```text
Moon Landing
July 20
```

is always:

```text
07-20
```

------

This reduces duplication dramatically.

------

# 4. CALENDAR COMPONENT IS MUCH BIGGER THAN IT LOOKS

The file:

```text
calendar.component.ts
```

is becoming a mini-application by itself.

------

It manages:

### Calendar list

```text
2025
2026
2027
```

------

### Year view

Heatmap-style representation.

Evidence:

```ts
HeatmapCell
HeatmapMonth
```



------

### Month view

Traditional month calendar.

------

### List view

Daily rows.

Evidence:

```ts
DateRow
```



------

### Day modal

Evidence:

```ts
selectedDay
dayModalEvents
```



------

### Campaign visibility

Evidence:

```ts
ad: boolean
```

inside day cells.

------

### Event slot visualization

Evidence:

```ts
getSlotEvent()
isSlotFilled()
```



------

# Technical Debt Alert

This component is approaching:

```text
God Component Territory
```

I would estimate:

```text
calendar.component.ts
```

already owns too many responsibilities.

Future refactor target:

```text
CalendarStateService

CalendarHeatmapComponent

CalendarMonthGridComponent

CalendarDayModalComponent
```

------

# 5. DAY DETAIL SCREEN

The route:

```text
/calendrier/:calendarId/:date
```

is where editors actually schedule content.

------

This screen combines:

```text
Calendar Entries
Campaign Assignments
Event Search
Slot Assignment
```

inside one workflow.

Evidence:

```ts
CalendarEntryService
CampaignService
EventService
```

are injected simultaneously.

------

This page is effectively:

```text
Editorial Control Center
```

------

# 6. EVENTS MODULE IS NOT CRUD

This is a misconception future developers will have.

At first glance:

```text
EventsComponent
```

looks like:

```text
Create
Read
Update
Delete
```

But actually it's:

```text
Library Management System
```

------

Evidence:

Excel import.

```ts
import * as XLSX from 'xlsx';
```



------

Meaning:

The team expects hundreds or thousands of events.

Not manual entry.

------

The import flow appears to be:

```text
Excel
 ↓
Preview
 ↓
Validation
 ↓
Draft Events
 ↓
Library
```

Evidence from import modal state machine:

```text
idle
preview
done
```



------

# 7. CAMPAIGN SYSTEM IS A SECOND SCHEDULER

Most people miss this.

Campaigns are not simply attached to events.

Instead:

```text
Campaign
    ↓
Assignment
    ↓
Calendar Day
```

Exactly like events.

------

So internally you have:

```text
Calendar Scheduler A
= Historical Content

Calendar Scheduler B
= Advertising
```

------

Evidence:

```text
campaign_assignments
```

counts appear alongside:

```text
calendar_entries
```

inside CalendarService.

------

That's a huge architectural clue.

------

# 8. USER MANAGEMENT IS HIGHLY PRIVILEGED

One of the better parts of the project.

------

Many developers would do:

```text
Angular
 ↓
update user_roles
```

directly.

Not here.

------

Instead:

```text
Angular
 ↓
Edge Function
 ↓
Service Role
 ↓
Supabase Admin API
```

Evidence:

manage-user function.

------

Capabilities:

```text
Update role
Block
Unblock
Delete
```

------

Interesting safeguard:

```ts
if (userId === user.id)
```

cannot modify yourself.

Very good.

------

# 9. MULTI-TENANCY IS EVERYWHERE

One thing I checked carefully:

Workspace filtering is not centralized.

It is repeated.

Example:

CalendarService:

```ts
eq('workspace_id', wsId)
```



CalendarEntryService:

```ts
eq('workspace_id', wsId)
```



------

Implication:

If a future developer forgets this filter in a new service:

```text
cross-tenant data leak
```

becomes possible.

------

Recommendation:

Long-term create:

```ts
WorkspaceAwareRepository
```

or

```ts
BaseSupabaseService
```

to enforce tenant filtering automatically.

------

# 10. THE TEST SUITE REVEALS DESIGN INTENT

A hidden goldmine.

The tests tell us what the original developers cared about.

------

Calendar tests verify:

```text
deleted_by
updated_by
workspace filtering
```



------

Navigation tests verify:

```text
Role restrictions
```



------

OTP tests verify:

```text
Signup/Login branching
```



------

Workspace tests verify:

```text
Automatic workspace activation
```



------

That tells me the team had production bugs in these areas previously and wrote tests afterward.

------

# The Three Most Likely Future Problem Areas

## 1. Calendar Component Complexity

Risk level:

```text
HIGH
```

The feature is accumulating unrelated responsibilities.

------

## 2. Workspace Filtering

Risk level:

```text
HIGH
```

Any new service could accidentally bypass tenant isolation.

------

## 3. Permission Drift

Risk level:

```text
MEDIUM-HIGH
```

Permissions exist in:

```text
Angular routes
Navigation UI
Edge Functions
Database policies
```

Keeping them synchronized will become harder as roles evolve.

------

# What I'd Analyze Next

For a takeover engineer, the next most valuable document would be:

### Deep Dive #3

**Database Forensics**

Including:

- every table
- every column
- every foreign key
- every index
- every unique constraint
- every RLS policy
- every migration
- every RPC function
- soft-delete strategy
- audit strategy
- tenancy strategy
- storage buckets
- Supabase auth integration
- hidden business rules enforced in SQL

That is where the remaining critical logic is likely hiding, because with Supabase a surprising amount of business behavior lives in SQL rather than Angular.
