Design a complete, production-ready enterprise SaaS web application UI/UX for a product called Selora.

Product summary:
Selora is an AI-powered QA automation platform for engineering and QA teams. It ingests Playwright codegen recordings, converts them into executable Playwright tests using AI, validates and repairs generated tests with bounded AI assistance, and allows teams to organize suites, execute runs, inspect artifacts, manage environments, audit activity, and control tenant/workspace governance.

Primary goal:
Create a professional, modern, premium B2B web app that feels credible for enterprise buyers, operationally clear for QA teams, and robust enough for multi-tenant admin workflows. The current UI should be fully replaced with a more polished, systematic, higher-trust experience.

Deliverables to generate in one design system:
1. Full information architecture
2. End-to-end desktop web app UI
3. Responsive mobile adaptations for critical screens
4. Design system and reusable components
5. Main user flows and interaction states
6. High-fidelity UI with production-ready UX decisions
7. Consistent visual language, spacing, hierarchy, and accessibility
8. Empty states, loading states, success states, error states, disabled states, and edge cases
9. Clickable prototype-ready flows
10. Handoff-friendly layouts and component naming

Brand and positioning:
Brand name: Selora
Tagline: AI-Powered QA for Faster Releases
Tone: precise, reliable, technical, confident, enterprise-grade, high-trust
Audience: QA leaders, engineering managers, SRE/platform teams, test automation engineers, workspace operators, tenant admins, platform admins
Avoid startup toy aesthetics. Avoid generic template dashboards. Avoid overly playful consumer styling.

Core product model:
Selora is a multi-tenant SaaS with role-aware permissions.
Roles:
- Platform admin
- Tenant admin
- Workspace operator
- Workspace viewer

Main product areas:
- Dashboard
- Suites
- Tests
- Runs
- Feedback
- Audit
- Settings

Settings subareas:
- Members
- Execution
- Lifecycle
- Quotas
- Retention
- Environments

Core workflows that must be designed end to end:
1. Upload Playwright recording
2. AI analysis and normalization
3. AI test generation
4. Validation pipeline with statuses
5. Bounded AI repair workflow with visible attempt history
6. Test selection and execution
7. Run monitoring and result review
8. Artifact inspection: logs, screenshots, traces, video if applicable
9. Suite management
10. Environment management with secret references
11. Member invitation and role management
12. Quota monitoring and limit awareness
13. Audit trail review
14. Tenant/workspace governance
15. Retention policy configuration

Design the complete app structure with these screens and views:
A. Global shell
- Left navigation sidebar
- Top header
- Workspace switcher
- Search / command palette entry point
- Notifications or alerts area
- User menu
- Clear breadcrumb or page context
- Support for dense enterprise usage without visual clutter

B. Dashboard
- KPI summary cards
- Test health overview
- Run success/failure trend chart
- Validation funnel or repair funnel
- Quota and usage overview
- Recent runs
- Recent repair attempts
- Alerts for quota risk, failed runs, invalid environments, expiring retention issues
- Empty state for a new workspace

C. Suites
- Suite catalog view
- Search, sort, filter
- Grid or table hybrid depending density
- Suite detail page
- Create/edit suite flow
- Execution policy section
- GitHub/TestRail integration placeholders
- Rollout controls
- Usage summary per suite

D. Tests
- Dense filterable table
- Status chips for ingested, generated, validating, validated, auto_repaired, needs_human_review, archived
- Bulk selection
- Tags
- Compatibility indicators for environments
- Last run result and timestamp
- Test detail page
- Tabs or segmented sections for code summary, validation history, repair attempts, artifacts, metadata
- Action panel for run, archive, review, inspect

E. Runs
- Runs list page with strong operational clarity
- Statuses: queued, running, passed, failed, canceled, timed_out
- Filters by suite, environment, status, actor, date
- Run detail page
- Summary metrics
- Step-by-step results
- Failing step emphasis
- Artifact drilldown
- Log viewer
- Screenshot gallery
- Trace/video access area
- Timeline of execution events

F. Recording ingestion
- Upload screen or modal for Playwright codegen TypeScript file
- Drag and drop
- File metadata preview
- Validation state
- Processing state
- Mapped progress from uploaded recording to generated test
- Post-upload next steps

G. Run creation flow
- Multi-step wizard or modal
- Step 1: choose suite
- Step 2: choose tests
- Step 3: choose environment
- Step 4: review and confirm
- Show estimated impact, environment compatibility, and warnings
- Handle disabled and invalid actions gracefully

H. Feedback
- Feedback inbox or structured list
- Ability to review AI quality feedback, failures, or flagged cases
- Include filters and categorization
- Show link back to related test/run

I. Audit
- Enterprise-grade audit trail
- Table plus timeline hybrid
- Filters for event type, actor, entity, date, tenant, workspace
- Rich metadata drawer
- Export affordance
- High trust, compliance-oriented feel

J. Settings
Members:
- User table
- Invite flow
- Role selector
- Access summary
- Remove and resend invite actions

Execution:
- Default execution policy
- Retry rules
- Validation and repair configuration
- Safe bounded defaults explained in UI

Lifecycle:
- Tenant/workspace lifecycle controls
- Status display
- Risk-aware confirmation modals for destructive actions

Quotas:
- Usage bars and charts
- Thresholds: normal, warning, critical, exceeded
- Visual clarity around current usage vs limits
- Support metrics like run count, execution minutes, storage, concurrent executions, repair attempts, seats, workspaces

Retention:
- Form for retention windows
- Logs, screenshots, videos, traces, audit cleanup
- Explanatory text and compliance cues

Environments:
- Environment list
- Create/edit form
- Name, base URL, secret reference, default flag
- Secret references should feel secure and not expose values
- Test compatibility and validation indicators

K. Platform admin / tenant governance
- Tenant list
- Tenant detail
- Provisioning status
- Workspace counts
- Quotas summary
- Lifecycle state
- Admin controls
- Strong separation from standard workspace UX

Data entities to reflect throughout the design:
- Suite
- Test
- Run
- Recording
- Artifact
- Repair attempt
- Quota
- Usage meter
- Environment
- Audit event
- Member
- Tenant
- Workspace

UX requirements:
- Make the product feel trustworthy, structured, and premium
- Optimize for clarity under high information density
- Use strong hierarchy for statuses, risks, and actions
- Distinguish operator workflows from admin workflows
- Design for power users without becoming visually noisy
- Use clear progressive disclosure for technical details
- Support large tables, detail drawers, sticky filters, and split views where appropriate
- Include bulk actions where it makes sense
- Use confirmation patterns for destructive actions
- Make AI states legible and bounded, never magical or vague
- Show why a status exists and what the next action is
- Include empty states that teach the workflow
- Include loading skeletons, inline validation, warnings, and retry states

Visual direction:
Create a polished enterprise visual system that feels more premium than a standard Tailwind dashboard.
Style goals:
- modern SaaS, refined, confident, high signal
- subtle depth, strong alignment, crisp surfaces
- balanced whitespace with dense data regions where needed
- restrained but memorable brand accents
- premium typography and consistent scale
- excellent readability for tables and status-heavy screens
- visually elegant but not decorative for its own sake

Avoid:
- generic startup dashboard clichés
- dribbble-style fantasy layouts with poor usability
- oversized marketing-style hero sections inside the product
- excessive gradients, glassmorphism everywhere, neon dark themes, or playful illustrations
- consumer app patterns that weaken operational trust

Preferred visual language:
- light theme primary
- optional dark mode concept only if it does not dilute the main deliverable
- neutral foundation with a distinctive brand accent
- meaningful state colors for success, warning, danger, info, validating, queued, running
- polished cards, tables, tabs, drawers, command surfaces, and modal patterns

Accessibility and usability:
- WCAG-conscious contrast
- keyboard-friendly patterns
- visible focus states
- accessible table density
- color not being the only indicator of status
- consistent hit areas and form spacing
- enterprise-ready responsiveness

Responsive requirements:
Design primarily for desktop first, then adapt critical flows for tablet and mobile:
- dashboard
- runs list/detail
- tests list/detail
- suite detail
- settings core screens
- run creation flow
On mobile, preserve workflow viability, not just visual shrinkage.

Component system to generate:
- navigation sidebar
- top bar
- workspace switcher
- searchable command palette
- KPI cards
- charts
- data tables
- filter bars
- status pills
- tabs
- drawers
- modals
- stepper / wizard
- upload zone
- form fields
- select menus
- role badges
- quota bars
- timeline
- audit event item
- artifact gallery
- log viewer
- empty states
- confirmation dialogs
- toast / inline alerts

Prototyping expectations:
Generate connected screens that demonstrate these prototype flows:
1. Upload recording to generated test
2. Review test and validation status
3. Create a run from selected tests and environment
4. Inspect a failed run and open artifacts
5. Review repair attempt history
6. Invite a member and assign role
7. Update environment configuration
8. Review quota warnings
9. Inspect audit event detail
10. Platform admin reviewing tenant lifecycle

Content style:
Use realistic enterprise copy, concise labels, and technically credible terminology.
Do not use lorem ipsum.
Use meaningful sample data for tests, runs, quotas, members, environments, artifacts, and audit events.

Output expectation:
Generate the entire product UX as a coherent system, not isolated mockups.
Create a professional design system first, then apply it across all screens.
Ensure screens share consistent patterns, states, spacing, and interaction logic.
Make this look like a real Series B to enterprise-grade QA automation platform that could be shipped after design refinement.

If the tool supports structured output, organize the result as:
1. Design principles
2. Sitemap / information architecture
3. Design system tokens and components
4. Core desktop screens
5. Responsive mobile versions
6. Key prototype flows
7. Empty / loading / error states
8. Notes for developer handoff

Important:
Do not simplify this into a generic analytics dashboard.
This is an AI QA operations platform with multi-tenant governance, bounded AI workflows, secure environments, auditability, and artifact-heavy run analysis.
Make the UI feel trustworthy, operational, and premium.