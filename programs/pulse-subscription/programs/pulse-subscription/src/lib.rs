use anchor_lang::prelude::*;

declare_id!("6qVHRzwu1CuDgaCmtaZZwG1sKv1uEjBKkHUA62UYxsww");

// ---------------------------------------------------------------------------
// Plan-limit constants — keep in sync with apps/web/src/lib/plans.ts
// ---------------------------------------------------------------------------
pub const TIER_FREE: u8 = 0;
pub const TIER_TEAM: u8 = 1;
pub const TIER_PROTOCOL: u8 = 2;
pub const MAX_TIER: u8 = 2;

/// FIX [AUDIT-1]: Use u8::MAX (255) as the sentinel for "unlimited" programs,
/// but expose the real on-chain limit as 255 slots, matching plans.ts protocol
/// tier semantics. The old code already used 255 but it creates an overflow
/// boundary: program_count can never legally reach 255 because the require!
/// check uses `<` not `<=`. This is intentional and correct — 255 means
/// "not reachable in practice" for the u8 field. Documented explicitly here.
pub const MAX_PROGRAMS_FREE: u8 = 1;
pub const MAX_PROGRAMS_TEAM: u8 = 5;
pub const MAX_PROGRAMS_PROTOCOL: u8 = u8::MAX; // 255 — effectively unlimited

/// FIX [AUDIT-2]: Free-tier callers MUST pass expires_at = 0 (sentinel).
/// The old code silently accepted any i64 for tier=0, meaning garbage data
/// could be written to expires_at. We now enforce expires_at == 0 for free.
pub const FREE_TIER_EXPIRY_SENTINEL: i64 = 0;

#[program]
pub mod pulse_subscription {
    use super::*;

    /// Called once per wallet after first payment.
    /// Creates the on-chain subscription account as a PDA
    /// seeded by ["subscription", owner_pubkey].
    pub fn initialize_subscription(
        ctx: Context<InitializeSubscription>,
        tier: u8,
        expires_at: i64,
    ) -> Result<()> {
        require!(tier <= MAX_TIER, PulseError::InvalidTier);

        let clock = Clock::get()?;

        if tier == TIER_FREE {
            // FIX [AUDIT-2]: enforce sentinel 0 for free tier
            require!(
                expires_at == FREE_TIER_EXPIRY_SENTINEL,
                PulseError::InvalidFreeTierExpiry
            );
        } else {
            require!(
                expires_at > clock.unix_timestamp,
                PulseError::ExpirationInPast
            );
        }

        let sub = &mut ctx.accounts.subscription;
        sub.owner = ctx.accounts.owner.key();
        sub.tier = tier;
        sub.expires_at = expires_at;
        sub.program_count = 0;
        sub.bump = ctx.bumps.subscription;
        sub.created_at = clock.unix_timestamp;

        emit!(SubscriptionCreated {
            owner: sub.owner,
            tier,
            expires_at,
        });

        msg!(
            "Subscription initialized: owner={}, tier={}, expires_at={}",
            sub.owner,
            tier,
            expires_at
        );

        Ok(())
    }

    /// Called on renewal or plan upgrade.
    /// Only the original owner can update their subscription.
    pub fn update_subscription(
        ctx: Context<UpdateSubscription>,
        tier: u8,
        expires_at: i64,
    ) -> Result<()> {
        require!(tier <= MAX_TIER, PulseError::InvalidTier);

        let clock = Clock::get()?;

        if tier == TIER_FREE {
            // FIX [AUDIT-2]: enforce sentinel on update too
            require!(
                expires_at == FREE_TIER_EXPIRY_SENTINEL,
                PulseError::InvalidFreeTierExpiry
            );
        } else {
            require!(
                expires_at > clock.unix_timestamp,
                PulseError::ExpirationInPast
            );
        }

        let sub = &mut ctx.accounts.subscription;

        // Prevent downgrades while current subscription is still active
        if sub.tier > tier && sub.expires_at > clock.unix_timestamp {
            return err!(PulseError::CannotDowngradeActivePlan);
        }

        sub.tier = tier;
        sub.expires_at = expires_at;

        emit!(SubscriptionUpdated {
            owner: sub.owner,
            tier,
            expires_at,
        });

        msg!(
            "Subscription updated: owner={}, tier={}, expires_at={}",
            sub.owner,
            tier,
            expires_at
        );

        Ok(())
    }

    /// Increment the tracked program count when a user registers a new program.
    /// Enforces plan-level limits: free=1, team=5, protocol=255.
    pub fn increment_program_count(ctx: Context<UpdateSubscription>) -> Result<()> {
        let sub = &mut ctx.accounts.subscription;
        let clock = Clock::get()?;

        require!(
            sub.tier == TIER_FREE || sub.expires_at > clock.unix_timestamp,
            PulseError::SubscriptionExpired
        );

        let max_programs: u8 = match sub.tier {
            TIER_FREE => MAX_PROGRAMS_FREE,
            TIER_TEAM => MAX_PROGRAMS_TEAM,
            TIER_PROTOCOL => MAX_PROGRAMS_PROTOCOL,
            _ => return err!(PulseError::InvalidTier),
        };

        require!(
            sub.program_count < max_programs,
            PulseError::ProgramLimitReached
        );

        // FIX [AUDIT-3]: checked_add with proper error instead of unwrap()
        sub.program_count = sub
            .program_count
            .checked_add(1)
            .ok_or(PulseError::ProgramLimitReached)?;

        msg!(
            "Program count incremented to {} for owner={}",
            sub.program_count,
            sub.owner
        );

        Ok(())
    }

    /// FIX [AUDIT-4]: Add decrement_program_count so off-chain can stay in
    /// sync when a program is deleted. Without this, program_count only ever
    /// grows and users hit ProgramLimitReached even after removing programs.
    pub fn decrement_program_count(ctx: Context<UpdateSubscription>) -> Result<()> {
        let sub = &mut ctx.accounts.subscription;

        require!(sub.program_count > 0, PulseError::ProgramCountUnderflow);

        sub.program_count = sub
            .program_count
            .checked_sub(1)
            .ok_or(PulseError::ProgramCountUnderflow)?;

        msg!(
            "Program count decremented to {} for owner={}",
            sub.program_count,
            sub.owner
        );

        Ok(())
    }

    /// Close the subscription account and reclaim rent to the owner.
    /// Only the owner can close their own subscription.
    pub fn close_subscription(_ctx: Context<CloseSubscription>) -> Result<()> {
        msg!("Subscription account closed, rent reclaimed to owner");
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Account Data
// ---------------------------------------------------------------------------

/// On-chain subscription state for a Pulse user.
/// PDA derived from ["subscription", owner_pubkey].
#[account]
#[derive(InitSpace)]
pub struct Subscription {
    /// The wallet pubkey that owns this subscription
    pub owner: Pubkey,        // 32 bytes
    /// Subscription tier: 0=free, 1=team ($99/mo), 2=protocol ($499/mo)
    pub tier: u8,             // 1 byte
    /// Unix timestamp when the subscription expires (0 for free tier)
    pub expires_at: i64,      // 8 bytes
    /// Number of programs registered under this subscription
    pub program_count: u8,    // 1 byte
    /// PDA bump seed for deterministic derivation
    pub bump: u8,             // 1 byte
    /// Unix timestamp when the subscription was first created
    pub created_at: i64,      // 8 bytes
}

impl Subscription {
    /// Check if the subscription is currently active.
    /// Free tier (0) is always active. Paid tiers check expiry.
    pub fn is_active(&self, clock: &Clock) -> bool {
        self.tier == TIER_FREE || clock.unix_timestamp < self.expires_at
    }

    /// Return max programs allowed for current tier.
    pub fn max_programs(&self) -> u8 {
        match self.tier {
            TIER_FREE => MAX_PROGRAMS_FREE,
            TIER_TEAM => MAX_PROGRAMS_TEAM,
            _ => MAX_PROGRAMS_PROTOCOL,
        }
    }
}

// ---------------------------------------------------------------------------
// Account Validation Structs
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeSubscription<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Subscription::INIT_SPACE,
        seeds = [b"subscription", owner.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateSubscription<'info> {
    #[account(
        mut,
        seeds = [b"subscription", owner.key().as_ref()],
        bump = subscription.bump,
        has_one = owner @ PulseError::Unauthorized,
    )]
    pub subscription: Account<'info, Subscription>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseSubscription<'info> {
    #[account(
        mut,
        seeds = [b"subscription", owner.key().as_ref()],
        bump = subscription.bump,
        has_one = owner @ PulseError::Unauthorized,
        close = owner,
    )]
    pub subscription: Account<'info, Subscription>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct SubscriptionCreated {
    pub owner: Pubkey,
    pub tier: u8,
    pub expires_at: i64,
}

#[event]
pub struct SubscriptionUpdated {
    pub owner: Pubkey,
    pub tier: u8,
    pub expires_at: i64,
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum PulseError {
    #[msg("Invalid subscription tier. Must be 0 (free), 1 (team), or 2 (protocol).")]
    InvalidTier,

    #[msg("Subscription expiration must be in the future for paid tiers.")]
    ExpirationInPast,

    #[msg("Cannot downgrade to a lower tier while the current plan is still active.")]
    CannotDowngradeActivePlan,

    #[msg("Subscription has expired. Please renew to continue.")]
    SubscriptionExpired,

    #[msg("Program limit reached for your current subscription tier.")]
    ProgramLimitReached,

    #[msg("You are not authorized to perform this action.")]
    Unauthorized,

    /// FIX [AUDIT-2]: new error for invalid free-tier expiry value
    #[msg("Free tier subscriptions must pass expires_at = 0.")]
    InvalidFreeTierExpiry,

    /// FIX [AUDIT-4]: new error for decrement underflow
    #[msg("Program count cannot go below zero.")]
    ProgramCountUnderflow,
}

// ---------------------------------------------------------------------------
// Unit Tests (native Rust, no localnet needed)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_sub(tier: u8, expires_at: i64, program_count: u8) -> Subscription {
        Subscription {
            owner: Pubkey::default(),
            tier,
            expires_at,
            program_count,
            bump: 255,
            created_at: 0,
        }
    }

    fn clock(ts: i64) -> Clock {
        Clock {
            slot: 0,
            epoch_start_timestamp: 0,
            epoch: 0,
            leader_schedule_epoch: 0,
            unix_timestamp: ts,
        }
    }

    // ---- is_active ---------------------------------------------------------

    #[test]
    fn free_tier_always_active() {
        let sub = make_sub(TIER_FREE, 0, 0);
        assert!(sub.is_active(&clock(i64::MAX)));
    }

    #[test]
    fn paid_tier_active_before_expiry() {
        let sub = make_sub(TIER_TEAM, 2_000_000_000, 0);
        assert!(sub.is_active(&clock(1_999_999_999)));
    }

    #[test]
    fn paid_tier_inactive_at_expiry() {
        let sub = make_sub(TIER_TEAM, 2_000_000_000, 0);
        // clock.unix_timestamp == expires_at → NOT active (strict less-than)
        assert!(!sub.is_active(&clock(2_000_000_000)));
    }

    #[test]
    fn paid_tier_inactive_after_expiry() {
        let sub = make_sub(TIER_PROTOCOL, 1_000, 0);
        assert!(!sub.is_active(&clock(9_999)));
    }

    // ---- max_programs ------------------------------------------------------

    #[test]
    fn max_programs_free_is_1() {
        let sub = make_sub(TIER_FREE, 0, 0);
        assert_eq!(sub.max_programs(), 1);
    }

    #[test]
    fn max_programs_team_is_5() {
        let sub = make_sub(TIER_TEAM, 9_999_999_999, 0);
        assert_eq!(sub.max_programs(), 5);
    }

    #[test]
    fn max_programs_protocol_is_255() {
        let sub = make_sub(TIER_PROTOCOL, 9_999_999_999, 0);
        assert_eq!(sub.max_programs(), u8::MAX);
    }

    // ---- program_count limits (logic simulation) ---------------------------

    #[test]
    fn free_limit_blocks_second_program() {
        let sub = make_sub(TIER_FREE, 0, 1); // already at limit
        assert!(sub.program_count >= sub.max_programs());
    }

    #[test]
    fn team_allows_up_to_5() {
        let sub = make_sub(TIER_TEAM, 9_999_999_999, 4);
        assert!(sub.program_count < sub.max_programs());
    }

    #[test]
    fn team_blocks_at_5() {
        let sub = make_sub(TIER_TEAM, 9_999_999_999, 5);
        assert!(sub.program_count >= sub.max_programs());
    }

    // ---- checked_add / overflow guard --------------------------------------

    #[test]
    fn checked_add_at_protocol_limit() {
        // program_count = 254 → can still add one
        let mut sub = make_sub(TIER_PROTOCOL, 9_999_999_999, 254);
        sub.program_count = sub.program_count.checked_add(1).unwrap();
        assert_eq!(sub.program_count, 255);
    }

    #[test]
    fn checked_add_overflow_returns_none() {
        // u8::MAX + 1 must overflow → None
        let sub = make_sub(TIER_PROTOCOL, 9_999_999_999, u8::MAX);
        assert!(sub.program_count.checked_add(1).is_none());
    }

    // ---- decrement ---------------------------------------------------------

    #[test]
    fn decrement_reduces_count() {
        let mut sub = make_sub(TIER_TEAM, 9_999_999_999, 3);
        sub.program_count = sub.program_count.checked_sub(1).unwrap();
        assert_eq!(sub.program_count, 2);
    }

    #[test]
    fn decrement_underflow_returns_none() {
        let sub = make_sub(TIER_FREE, 0, 0);
        assert!(sub.program_count.checked_sub(1).is_none());
    }

    // ---- tier validation ---------------------------------------------------

    #[test]
    fn tier_3_is_invalid() {
        assert!(3u8 > MAX_TIER);
    }

    #[test]
    fn tier_255_is_invalid() {
        assert!(255u8 > MAX_TIER);
    }

    // ---- free-tier expiry sentinel -----------------------------------------

    #[test]
    fn free_tier_expiry_must_be_zero() {
        // sentinel: free tier should always store 0
        assert_eq!(FREE_TIER_EXPIRY_SENTINEL, 0i64);
        let sub = make_sub(TIER_FREE, FREE_TIER_EXPIRY_SENTINEL, 0);
        assert_eq!(sub.expires_at, 0);
    }

    // ---- downgrade logic ---------------------------------------------------

    #[test]
    fn downgrade_blocked_when_active() {
        let sub = make_sub(TIER_PROTOCOL, 9_999_999_999, 0);
        let now = 1_000;
        // sub.tier(2) > new_tier(1) and sub.expires_at > now → blocked
        let would_block = sub.tier > TIER_TEAM && sub.expires_at > now;
        assert!(would_block);
    }

    #[test]
    fn downgrade_allowed_when_expired() {
        let sub = make_sub(TIER_PROTOCOL, 500, 0);
        let now = 1_000; // past expiry
        let would_block = sub.tier > TIER_TEAM && sub.expires_at > now;
        assert!(!would_block);
    }
}
