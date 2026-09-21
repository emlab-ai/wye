# Explore agent prompt — CLIENT side

Substitute `<MODULE>` and `<ROOTS>` (e.g. client/src/modules/inventory/**, client/src/pages/inventory/**). Run with `subagent_type: Explore`, thoroughness "very thorough".

```
Explore the <MODULE> module CLIENT side in <repo>/client (React/TypeScript, MVVM). Thoroughness: very thorough.
Roots: <ROOTS>. Also grep the router config for the module's routes, the navigation/menu entries, feature-flag gating,
permission config, and where OTHER parts of the client touch this module (register/sales, product editor, dashboard
widgets, settings pages, shared components, realtime/entity-change subscriptions, offline replica).

I need a STRUCTURED map, not prose. Produce:

1. PAGES/SCREENS: route path → page component file → purpose (one line) → ViewModel file → roles/feature gates.
2. For each page: every user-visible ACTION (buttons, menu items, dialogs, forms, row clicks): label → what it does →
   which GraphQL query/mutation document it calls (file:line). Include dialogs and wizards and their validation.
3. DATA: the GraphQL documents (queries, mutations, fragments, subscriptions) with one-line purpose and line numbers.
4. VIEWMODELS/STORES: each .vm.ts or store, its state and key methods (brief).
5. CLIENT-SIDE RULES: validations, guards, disabled states, display rules (colours, thresholds, badges, polling
   intervals, money /100, unit conversion display, hardcoded numbers), URL state, offline behaviour. file:line each.
6. CROSS-MODULE EDGES on the client.
7. TEST COVERAGE: .test.ts(x), .stories.tsx and ui-tests specs — file + behaviours asserted, one line each.
   Then list the surfaces with NO test/story/e2e.

Cite file paths and line numbers. Compact markdown lists/tables. I will turn this into a formal spec.
```
