# Screen Catalog And Planning

## V2 Specification Set
- `docs/screens/v2/` contains detailed per-screen specs for all planned product journey screens.

## HouseGains v1 — In progress

These HouseGains screens are specified in `docs/screens/housegains-v1.md`. Status is **In progress**; this catalog records intended scope and does not claim implementation or production wiring.

| Screen ID | Screen | Primary purpose | Status |
|---|---|---|---|
| Picker | Appearance picker | Swipe a full-screen pager of Sticker Pop, Arcade, and Soft Home previews; a page's Choose button saves that style | In progress |
| G1 | Create household | Create household profile as creator | In progress |
| G2 | Pick chores | Add household-owned copies from catalog | In progress |
| G3 | Invite housemates | Share code, QR, or deep link | In progress |
| G4 | Assign chores | Choose multiple assignees or Unassigned | In progress |
| G5 | Join | Join a household through an invite | In progress |
| T1 | Settings > Chores | Manage chore definitions and future instances | In progress |
| T2 | Custom chore builder | Define subtasks, XP, recurrence, due time, and assignments | In progress |
| T3 | Catalog chore detail | Review a template before making a household copy | In progress |
| S1 | Today with subtasks | Track household instance progress and completion | In progress |
| S2 | Chore detail | Review snapshot, contributors, ledger, and undo | In progress |
| S3 | 100% bonus | Show completion bonus allocation and attribution | In progress |
| Ranks | Household ranks | Review standings derived from XP ledger | In progress |
| Feed | Completion activity | Review who completed which instance and when | In progress |
| Settings | Personal and household settings | Change appearance/language and open chore management | In progress |

## Current Implemented Screens

| Screen | Route | Type | Purpose | Status |
|---|---|---|---|---|
| Root resolver | `/` | Router | Restores auth, terms, role, and role-home routing | Implemented |
| Student home | `/student/home` | Tab | Daily plan, hydration, and relationship entry | Implemented |
| Student nutrition | `/student/nutrition/today` (canonical, SC-209), tab alias `/student/nutrition` | Tab | Assigned/self-managed nutrition tracking | Implemented |
| Student training | `/student/training/today` (canonical, SC-210), tab alias `/student/training` | Tab | Assigned/self-managed workout tracking | Implemented |
| Custom meal library/builder | `/nutrition/custom-meals`, `/nutrition/custom-meals/:mealId` | Stack | Meal reuse, logging, photo analysis, upload, and sharing | Implemented |
| Student professionals | `/student/professionals` | Stack | Invite, QR fallback, connection state, and relationship ending | Implemented |
| Professional dashboard | `/professional/home` | Tab | Operational workbench and subscription state | Implemented |
| Professional students/profile/pending | `/professional/students`, `/professional/student-profile`, `/professional/pending` | Stack | Roster, tracking review, bulk assignment, and pending queue | Implemented |
| Professional plan libraries/builders | `/professional/nutrition`, `/professional/training`, `/professional/*/plans/:planId` | Stack | Reusable nutrition/training plan authoring and assignment | Implemented |
| Professional specialties/subscription | `/professional/specialty`, `/professional/subscription` | Stack | Specialty configuration/removal assist and entitlement handoff | Implemented |
| Authentication/terms/role | `/auth/sign-in`, `/auth/create-account`, `/auth/accept-terms`, `/auth/role-selection` | Stack | Session entry, legal gate, and immutable role onboarding | Implemented |
| Account/language | `/settings/account`, `/settings/language-select` | Stack | Privacy, support, localization, deletion, and sign-out | Implemented |
| Shared recipe | `/shared/recipes/:shareToken` | Deep link | Preview and idempotent account-owned save | Implemented |

## Planned Screens Backlog

Use one line per future screen.

| Screen Name | Route (proposed) | Owner Feature | Problem Solved | Key Data Needed | Primary Actions | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| Auth Sign-In | `/auth/sign-in` | Identity And Access | Authenticate existing accounts and link social providers | Credentials and provider tokens | Sign in via email/password, Google, Apple | Auth provider | Specified (V2) |
| Auth Create Account | `/auth/create-account` | Identity And Access | Register new accounts with password policy enforcement | Name/email/password fields and provider tokens | Create account and social auth | Auth provider | Specified (V2) |
| Auth Accept Terms | `/auth/accept-terms` | Identity And Access | Ensure latest legal terms are accepted before onboarding continuation | Required terms version + legal URL + per-user acceptance state | Open legal link, check acceptance, continue | Auth session and route guard | Specified (V2) |
| Auth / Role Selection | `/auth/role-selection` | Identity And Access | Branch user into correct journey with self-guided path | Account and role choice | Choose Student or Professional, continue | Auth provider | Specified (V2) |
| Professional Specialty Setup | `/onboarding/professional-specialty`, `/professional/settings/specialties` | Identity And Access | Capture/manage professional capabilities | Specialty choices and optional credentials | Select/add/remove specialties | Role onboarding | Specified (V2) |
| Student Home Dashboard | `/student/home` | Student Journey | Central access to assigned/self plans | Assignment and progress summary | View plans, log progress | Assignment service | Specified (V2) |
| Professional Dashboard | `/professional/home` | Professional Journey | Manage multiple students | Client roster and statuses | Open student profile, assign plans | Assignment service | Specified (V2) |
| Student Roster | `/professional/students` | Professional Journey | Browse/manage client base | Student list data | Filter, search, open student | Data API | Specified (V2) |
| Student Profile (Professional View) | `/professional/students/:studentId` | Professional Journey | Configure plans per student | Student metrics and current plans | Create/edit/assign plans | Plan services | Specified (V2) |
| Nutrition Plan Builder | `/professional/nutrition/plans/:planId` | Nutrition Management | Author reusable/custom meal plans | Food database, macro targets | Add foods, set macros/calories | Food calorie API | Specified (V2) |
| Custom Meal Builder | `/nutrition/custom-meals/:mealId` | Nutrition Tracking | Create/edit reusable custom meals | Meal totals, weight, optional ingredient cost | Save meal definition | Nutrition tracking model | Specified (V2) |
| Custom Meal Library And Quick Log | `/nutrition/custom-meals` | Nutrition Tracking | Reuse saved meals and log consumed grams quickly | Saved custom meals and grams input | Select meal, log grams | Nutrition tracking model | Specified (V2) |
| Shared Recipe Save Confirmation | `/shared/recipes/:shareToken` | Recipe Sharing | Save shared recipe as account-owned copy | Share token and source recipe snapshot | Confirm save to account | Sharing service and auth | Specified (V2) |
| Training Plan Builder | `/professional/training/plans/:planId` | Training Management | Author reusable/custom sessions | Exercise model data | Add sessions/exercises | Training schema model | Specified (V2) |
| Relationship Management | `/student/professionals` | Assignment Lifecycle | Connect/replace professionals | Professional lookup and assignment state | Manual invite entry, QR scan, accept, replace, remove | Assignment lifecycle rules | Specified (V2) |
| Professional Subscription Gate | `/professional/subscription` | Monetization | Unlock management beyond 10 active students | Entitlement and product data | Purchase, restore, view plan | RevenueCat + store billing | Specified (V2) |
| Account And Privacy Settings | `/settings/account` | Compliance | Give users account deletion and policy access | Account state and legal links | Delete account, view privacy policy | Store policy requirements | Specified (V2) |

## Per-Screen Planning Checklist
- Screen objective and user value.
- Primary and secondary actions.
- Inputs and outputs.
- Empty/loading/error/success states.
- Accessibility and platform-specific behavior.
- Analytics events.
- Linked use cases, ACs, rules, and test cases.
