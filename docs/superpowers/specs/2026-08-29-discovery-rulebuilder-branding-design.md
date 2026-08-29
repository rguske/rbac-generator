# rbac-generator — Discovery, Rule Builder & Branding Enhancements — Design Spec

**Date:** 2026-08-29
**Status:** Approved

## 1. Overview & Goals

This is a v1.1 enhancement batch driven by user feedback on the shipped v1 (see
`2026-08-29-rbac-generator-design.md`). It covers three related-but-independent
areas, combined into a single spec/plan per the user's preference:

1. **Discovery & Rule Builder rework** — surface custom-resource (CRD-backed) resources
   distinctly, and let users build policy rules via cascading dropdowns for
   apiGroups → resources → subResources → verbs, instead of flat independent
   chip-lists.
2. **Split-pane Form ⇄ YAML view** — replace the Create page's mutually-exclusive
   Form/YAML toggle with an always-visible, two-way-synced side-by-side layout, so
   users see the YAML update live as they build a resource.
3. **Branding & guidance polish** — a colored masthead, an app logo, and `?`
   help-tooltips on every required field on the Create page.

Non-goals:

- A definitive/live CRD list via `apiextensions.k8s.io` (rejected in favor of a
  cheaper naming heuristic — see §2.2).
- Tooltips outside the Create page (Connection/Login pages keep their current,
  already-descriptive labels).
- Any change to backend RBAC semantics — `resources: ["pods/log"]`-style combined
  strings are exactly what real Kubernetes RBAC already expects, so no new wire
  format or build-time transformation is introduced.

## 2. Discovery API changes (backend)

### 2.1 SubResources

`LiveResources` (`backend/internal/discovery/discovery.go`) currently **skips** any
API resource whose name contains `/` (e.g. `pods/log`, `deployments/scale`). Instead,
it will group these under their parent resource:

```go
type Resource struct {
	Group            string   `json:"group"`
	Version          string   `json:"version"`
	Resource         string   `json:"resource"`
	Kind             string   `json:"kind"`
	Namespaced       bool     `json:"namespaced"`
	SubResources     []string `json:"subResources,omitempty"`
	IsCustomResource bool     `json:"isCustomResource"`
}
```

`pods/log` and `pods/status` become `SubResources: ["log", "status"]` on the `pods`
entry, keyed by matching `(group, version, resource)` across the discovery response
(subresources always share their parent's group/version).

`StaticResources` (the offline fallback list) gets hand-picked `SubResources` added
for the built-ins that commonly have them:

| Resource | SubResources |
|---|---|
| `pods` | `log`, `status`, `exec`, `portforward`, `attach`, `ephemeralcontainers` |
| `deployments`, `statefulsets`, `replicasets` | `scale`, `status` |
| `nodes` | `status`, `proxy` |
| everything else | none (empty) |

### 2.2 IsCustomResource (heuristic)

`IsCustomResource` is `true` when a resource's `Group` is non-empty and is **not** in
a fixed allow-list of well-known built-in Kubernetes/OpenShift API group suffixes:

```go
var builtinGroupSuffixes = []string{
	"", // core
	"k8s.io", "apps", "batch", "policy", "autoscaling",
	"authentication.k8s.io", "authorization.k8s.io", "certificates.k8s.io",
	"coordination.k8s.io", "discovery.k8s.io", "events.k8s.io",
	"flowcontrol.apiserver.k8s.io", "networking.k8s.io", "node.k8s.io",
	"rbac.authorization.k8s.io", "scheduling.k8s.io", "storage.k8s.io",
	"apiextensions.k8s.io", "admissionregistration.k8s.io",
	"metrics.k8s.io", "apiregistration.k8s.io",
}
```

A group is "built-in" if it exactly equals `""` or ends with `.k8s.io`/is in the
explicit list above; anything else (e.g. `route.openshift.io`, `tekton.dev`,
`myoperator.example.com`) is classified `IsCustomResource: true`. This is a naming
heuristic, not a definitive lookup (that would require a separate
`apiextensions.k8s.io/v1 CustomResourceDefinitions` list call and its own RBAC
permission on the target cluster, which was explicitly descoped) — it will
misclassify the rare built-in-looking custom group, but correctly handles the
overwhelming majority of real-world CRDs, which use custom domain-style groups.

`StaticResources` entries are all built-in by construction, so `IsCustomResource` is
always `false` there.

## 3. Rule Builder UX (frontend)

`Create.tsx`'s catalog-building effect stops flattening discovery data down to
`resources: string[]` immediately; it now keeps the richer per-resource shape
(`{ group, resource, subResources, isCustomResource }`) so `RuleBuilder` can filter
and label using it.

`RuleBuilder.tsx`, per rule row:

- **apiGroups**: unchanged `ChipMultiSelect` (dropdown + free-text custom entry).
- **resources**: the flat `ChipMultiSelect` is replaced by a new `ResourcePicker`
  sub-component:
  - A resource `<select>` that **cascades**: if the rule already has apiGroup(s)
    selected, only resources whose `group` is in that set are listed; if no
    apiGroup is selected yet, every known resource is listed.
  - Each option is suffixed with `(Custom Resource)` when `isCustomResource` is
    `true`, so users can visually distinguish CRD-backed resources from built-ins.
  - A second `<select>` for subResource, populated from the chosen resource's
    `SubResources` (default `— none —`).
  - An **Add** button that appends a single string to the rule's `resources` chip
    list: `resource` alone, or `resource/subResource` when a subresource was
    picked — this is exactly the real RBAC wire format, so no extra combining
    logic is needed anywhere else (dry-run, apply, YAML view all keep working
    unchanged).
  - The existing chip list below (with individual remove buttons) is unchanged.
  - Free-text fallback is preserved: a `TextInput` + "Add custom" button lets users
    type an arbitrary `resource` or `resource/subResource` string directly, for
    offline/static mode or resources discovery doesn't know about.
- **verbs**: unchanged `ChipMultiSelect`.

## 4. Split-pane Form ⇄ YAML view (replaces the toggle)

The current `YamlToggle.tsx` shows either the form or a YAML editor, never both — and
only reconciles YAML edits back into the form model when the user explicitly
switches back to "Form" mode. Per user feedback, this is replaced with a persistent
two-column layout on the Create page: form on the left, a live, editable YAML pane
on the right, kept in sync in both directions.

- **Form → YAML**: any form field change re-serializes the current value to YAML via
  `toYaml()` and updates the right pane immediately.
- **YAML → Form**: as the user types in the YAML pane, ~400ms after typing pauses,
  the current text is parsed via `fromYaml()`. If it parses successfully against the
  expected `Kind` schema, `onChange(parsed)` is called, updating the form fields on
  the left. If it doesn't parse (mid-edit, invalid syntax), an inline "Invalid YAML"
  note appears near the pane, but typing is never blocked and the raw text is never
  reverted — unlike today's toggle, which currently blocks switching back to Form on
  invalid YAML.
- To avoid the "controlled editor fights the user" problem (reformatting the YAML
  pane's text and jumping the cursor every time a keystroke there round-trips
  through the parser), the YAML pane's text is only regenerated from `toYaml(value)`
  when the most recent change originated from the **form** side; edits originating
  in the YAML pane itself update the model without the pane immediately overwriting
  its own raw text. This is tracked with a `lastChangeSource: 'form' | 'yaml'` ref.
- Layout: PatternFly `Grid`/`Flex` two-column split (form ~55%, YAML ~45% width) on
  wide viewports; stacks to form-above/YAML-below on narrow viewports, since a form
  and a code editor side-by-side in a narrow column isn't usable.
- The `ToggleGroup` "Form"/"YAML" switch buttons are removed entirely, since both
  panes are now always visible.
- This changes the component enough that it's effectively new: `YamlToggle.tsx` is
  renamed `FormYamlSplit.tsx` (same `toYaml`/`fromYaml` helpers from
  `lib/yamlSync.ts`, same external props: `value`, `onChange`, `kind`,
  `renderForm`). `Create.tsx`'s usage is updated to the new name; no other callers
  exist.
- This also resolves a pre-existing minor gap noted in the v1 final review: dry-run
  previously could use a stale `resource` value if the user edited YAML and clicked
  "Preview & Dry-Run" without switching back to Form mode first. With both panes
  always live and synced, that staleness window no longer exists.

## 5. Branding

Approved via the visual companion (mockups reviewed and iterated live in-browser):

- **Logo**: a flat, two-tone padlock+gear icon (padlock body doubling as a gear hub,
  gear teeth around the edge), red (`#A30000`) and white, transparent background.
  The approved 1024×1024 source has already been saved as
  `frontend/src/assets/logo.png`; the implementation step resizes it down (e.g. to
  64×64 for the masthead `<img>` and a 32×32 `favicon.png`) so a ~800KB raster
  asset doesn't bloat the page load for what renders as a small icon.
- **Masthead**: a solid blue (`#0066CC`) background bar with white text, applied via
  a scoped CSS override targeting only `.pf-v6-c-masthead` (new
  `frontend/src/masthead-theme.css`, imported once in `main.tsx`). The logo (red)
  sits directly on the blue masthead as a fixed, colorful brand mark — deliberately
  not recolored to match, the same way most product logos stay a fixed color
  regardless of surrounding chrome.
- Everything else (buttons, links, active nav item, alerts) keeps PatternFly's
  default styling — no other components are recolored, so destructive/danger
  semantics stay visually unambiguous from branding.

## 6. Required-field tooltips (Create page only)

A `?` help icon + `Popover` next to the label of every required field on the Create
page, via PatternFly's `FormGroup labelHelp` pattern:

- **Name**, **Namespace**, **Role reference name**: one-sentence explanation + a
  concrete example (e.g. Namespace → "The namespace this Role applies to. Must be
  an existing namespace on the connected cluster, e.g. `default`.").
- Inside `RuleBuilder`: one popover per field label (apiGroups / resources /
  subResource / verbs) explaining what it means with a real example (e.g. verbs →
  "The actions this rule allows, e.g. `get`, `list`, `watch`.").
- Inside `SubjectBuilder`: one popover explaining subject Kind/Name/Namespace.

## 7. Testing

- **Backend**: table-driven tests for the new subresource-grouping logic in
  `LiveResources` (mixed parent/subresource API lists → correctly grouped output)
  and for the `IsCustomResource` heuristic (built-in groups classified `false`,
  made-up custom-domain groups classified `true`); updated `StaticResources`
  assertions for the new hand-picked `SubResources`.
- **Frontend**:
  - `RuleBuilder.test.tsx` gets new cases for cascading resource filtering by
    selected apiGroup(s), the custom-resource label suffix, and resource+subresource
    combination into a single chip (`pods` + `log` → `pods/log`).
  - `Create.test.tsx` updated for the richer catalog shape; assertions that each
    required field renders a help-tooltip trigger.
  - `FormYamlSplit.test.tsx` (replacing `YamlToggle.test.tsx`): both panes render
    simultaneously; editing a form field updates the YAML pane's text; typing valid
    YAML (after the debounce) updates the form; typing invalid YAML shows the inline
    error without clearing the pane or blocking further typing; a regression test
    confirms the YAML pane's own edits don't get clobbered/reformatted by the
    form-side sync effect on the very next render.

## 8. Decision Log

| Decision | Choice |
|---|---|
| Spec scope | Combined single spec/plan covering discovery+rule-builder and branding+tooltips |
| CRD visibility | Label/group as "Custom Resource" in the resources dropdown using a group-name heuristic; no separate `apiextensions.k8s.io` call |
| Resources dropdown | Cascades: filtered to resources whose group matches the rule's selected apiGroup(s) |
| Free-text fallback | Kept for all fields (apiGroups, resources, subResource, verbs), for offline/static mode and unknown resources |
| SubResource UI | Combined resource+subResource picker that appends a single `resource[/subResource]` string to the rule's `resources` list, matching real RBAC wire format exactly |
| Masthead color | Solid blue `#0066CC` background bar, white text; scoped to `.pf-v6-c-masthead` only |
| Logo | Padlock+gear icon, kept red (`#A30000`)/white as a fixed brand mark regardless of masthead color |
| Color scope | Masthead only — buttons/links/alerts keep PatternFly defaults, preserving danger/success semantics |
| Tooltip scope | Create page only (Name/Namespace/RoleRef fields, RuleBuilder, SubjectBuilder) |
| Form/YAML layout | Persistent side-by-side split (form left, YAML right) replacing the mutually-exclusive toggle |
| YAML pane edits | Live, two-way synced with the form, ~400ms debounce; invalid YAML shows an inline note without blocking typing or reverting text |
| YAML pane re-render guard | Pane text only regenerated from the model when the last change came from the form side, to avoid fighting the user's in-progress typing/cursor position |
