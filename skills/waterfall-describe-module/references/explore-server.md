# Explore agent prompt — SERVER side

Substitute `<MODULE>` (e.g. Inventory) and `<ROOTS>` (e.g. Server/GraphQL/Inventory/**, Server/Services/InventoryModuleService.cs). Run with `subagent_type: Explore`, thoroughness "very thorough".

```
Explore the <MODULE> module SERVER side in <repo root> (C# / HotChocolate GraphQL). Thoroughness: very thorough.
Roots: <ROOTS>, plus any Core/ types referenced. Also grep OUTSIDE those roots for where other modules call into <MODULE>
(service interfaces, entity-pipeline subscriptions, feature/permission gates, settings on Location/Tenant that change its behaviour).

I need a STRUCTURED inventory of the domain, not prose. Produce:

1. ENTITIES: for each domain class: file path, fields with types (brief), enums with their values, and which other
   entities it references (by id). Say whether it is a collection or embedded. Note computed/[BsonIgnore] properties.
2. OPERATIONS: every GraphQL query and mutation (name, input args briefly, what it does in one line, which service
   method it calls, authorization policy, whether the feature flag is checked, file path:line). Also MCP tools / REST endpoints.
3. RULES / INVARIANTS / CONSTRAINTS visible in service code: ordering rules, negative/zero handling, validation lists,
   idempotency guards, state transitions, soft-delete, tenant/location scoping, feature gating, permissions, money units.
   Quote file:line for each.
4. CROSS-MODULE EDGES: which other modules call into this one and how; which settings/flags change its behaviour.
5. TESTS: list every test file under Server.Tests and Server.IntegrationTests for this module and the behaviours each
   asserts (one line each) — tests are the best source of intended behaviour.
6. INCONSISTENCIES you noticed: two definitions of the same concept, stale comments, obsolete-but-still-written fields,
   ungated endpoints, doc comments that don't match code.

Be precise, cite file paths and line numbers. Compact markdown lists/tables. I will turn this into a formal spec.
```
