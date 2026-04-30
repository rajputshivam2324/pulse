---
name: solana-anchor
description: >
  Use when working on anything in programs/pulse-subscription — Rust Anchor programs,
  IDL generation, PDA derivation, instruction authoring, on-chain subscription state,
  testing with Anchor test framework, or deploying to devnet/mainnet via Anchor CLI.
  Trigger words: Anchor, PDA, lib.rs, Cargo.toml, cargo build-sbf, anchor build,
  anchor deploy, anchor test, subscription tier, program_count, declare_id.
version: "1.0"
---

# Skill: Solana Anchor — Pulse On-Chain Programs

## Project Context

The on-chain code lives at `programs/pulse-subscription/`.

```
programs/pulse-subscription/
├── Anchor.toml                            # cluster=devnet, wallet=~/.config/solana/id.json
├── Cargo.toml / Cargo.lock
└── programs/pulse-subscription/
    ├── Cargo.toml                         # [lib] crate-type = ["cdylib","lib"]
    └── src/lib.rs                         # All program logic
```

**Program ID (devnet):** `6qVHRzwu1CuDgaCmtaZZwG1sKv1uEjBKkHUA62UYxsww`  
**Program ID (localnet):** `3UAr7wLdjwjs4PASQzu5snfTa9dgdbUuX7bSg7Z3pjbb`  
**Anchor.toml provider:** `cluster = "devnet"`, `wallet = "~/.config/solana/id.json"`

---

## Subscription Account Schema

```rust
#[account]
#[derive(InitSpace)]
pub struct Subscription {
    pub owner: Pubkey,        // 32 bytes — wallet that owns the sub
    pub tier: u8,             // 1 byte  — 0=free, 1=team, 2=protocol
    pub expires_at: i64,      // 8 bytes — unix timestamp (0 is valid for free)
    pub program_count: u8,    // 1 byte  — # programs registered
    pub bump: u8,             // 1 byte  — PDA bump seed
    pub created_at: i64,      // 8 bytes — creation unix timestamp
}
```

**PDA seeds:** `["subscription", owner_pubkey]`  
**Account space:** `8 (discriminator) + Subscription::INIT_SPACE`

---

## Plan Limits (must stay in sync with `apps/web/src/lib/plans.ts`)

| Tier | Value | Label    | Price   | max_programs | Expiry Required |
|------|-------|----------|---------|--------------|-----------------|
| free | 0     | Free     | $0      | 1            | No              |
| team | 1     | Team     | $99/mo  | 5            | Yes             |
| proto| 2     | Protocol | $499/mo | 255 (∞)      | Yes             |

---

## Instructions

### `initialize_subscription(tier: u8, expires_at: i64)`
- Validates `tier <= 2`
- For `tier > 0`, validates `expires_at > Clock::get().unix_timestamp`
- Creates PDA subscription account, sets all fields, emits `SubscriptionCreated`

### `update_subscription(tier: u8, expires_at: i64)`
- Only the `owner` signer can call
- Prevents downgrade while current paid subscription is still active
- Emits `SubscriptionUpdated`

### `increment_program_count()`
- Enforces plan limits: free=1, team=5, protocol=255
- Errors with `ProgramLimitReached` if at cap
- Errors with `SubscriptionExpired` for non-free expired subs

### `close_subscription()`
- Closes account and returns rent to owner
- Uses `close = owner` constraint in account struct

---

## Custom Errors

| Error                    | Code | Message                                                          |
|--------------------------|------|------------------------------------------------------------------|
| `InvalidTier`            | 6000 | Tier must be 0, 1, or 2                                         |
| `ExpirationInPast`       | 6001 | expires_at must be in the future for paid tiers                  |
| `CannotDowngradeActivePlan` | 6002 | Cannot downgrade while current plan is still active          |
| `SubscriptionExpired`    | 6003 | Subscription has expired. Please renew.                          |
| `ProgramLimitReached`    | 6004 | Program limit reached for your current subscription tier.        |
| `Unauthorized`           | 6005 | You are not authorized to perform this action.                   |

---

## Events

```rust
#[event] pub struct SubscriptionCreated { pub owner: Pubkey, pub tier: u8, pub expires_at: i64 }
#[event] pub struct SubscriptionUpdated { pub owner: Pubkey, pub tier: u8, pub expires_at: i64 }
```

---

## Common Commands

```bash
# Build the program (SBF bytecode)
cd programs/pulse-subscription
anchor build

# Run tests (requires Anchor.toml scripts.test)
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Generate IDL JSON
anchor build --idl

# Get program logs
solana logs --url devnet 6qVHRzwu1CuDgaCmtaZZwG1sKv1uEjBKkHUA62UYxsww
```

---

## Critical Rules

1. **Never change `declare_id!`** without updating `Anchor.toml [programs.*]` and the SDK.
2. **PDA derivation** must always be `["subscription", owner.key().as_ref()]` — changing seeds breaks existing accounts.
3. **`INIT_SPACE`** is derived automatically by `#[derive(InitSpace)]`; do not hardcode space.
4. **`has_one = owner`** constraint handles auth for `UpdateSubscription` and `CloseSubscription` — don't add redundant checks.
5. **Keep tier limits in sync** with `apps/web/src/lib/plans.ts` `PLAN_LIMITS` object.
6. When adding a new instruction, also add it to the **TypeScript SDK** in `packages/sdk/src/index.ts`.

---

## Docs

- Anchor Book: https://book.anchor-lang.com/
- Anchor Reference: https://docs.rs/anchor-lang/latest/anchor_lang/
- Solana Cookbook: https://solanacookbook.com/
- Solana RPC API: https://solana.com/docs/rpc
- anchor-lang crates.io: https://crates.io/crates/anchor-lang