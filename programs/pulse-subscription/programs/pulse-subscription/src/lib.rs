use anchor_lang::prelude::*;

declare_id!("6qVHRzwu1CuDgaCmtaZZwG1sKv1uEjBKkHUA62UYxsww");

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
        // Validate tier is a known plan: 0=free, 1=team, 2=protocol
        require!(tier <= 2, PulseError::InvalidTier);

        // Validate expiry is in the future (or allow tier 0 / free with any expiry)
        let clock = Clock::get()?;
        if tier > 0 {
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
        // Validate tier is a known plan
        require!(tier <= 2, PulseError::InvalidTier);

        // Validate expiry is in the future for paid tiers
        let clock = Clock::get()?;
        if tier > 0 {
            require!(
                expires_at > clock.unix_timestamp,
                PulseError::ExpirationInPast
            );
        }

        let sub = &mut ctx.accounts.subscription;

        // Prevent downgrades while current subscription is still active
        // (allow if expired or upgrading)
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
    /// Enforces plan-level limits: free=1, team=5, protocol=unlimited.
    pub fn increment_program_count(ctx: Context<UpdateSubscription>) -> Result<()> {
        let sub = &mut ctx.accounts.subscription;
        let clock = Clock::get()?;

        // Ensure subscription is active (free tier is always active)
        require!(
            sub.tier == 0 || sub.expires_at > clock.unix_timestamp,
            PulseError::SubscriptionExpired
        );

        // Enforce plan limits
        let max_programs: u8 = match sub.tier {
            0 => 1,   // free
            1 => 5,   // team
            2 => 255, // protocol (effectively unlimited)
            _ => return err!(PulseError::InvalidTier),
        };

        require!(
            sub.program_count < max_programs,
            PulseError::ProgramLimitReached
        );

        sub.program_count = sub.program_count.checked_add(1).unwrap();

        msg!(
            "Program count incremented to {} for owner={}",
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
    /// Unix timestamp when the subscription expires
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
        self.tier == 0 || clock.unix_timestamp < self.expires_at
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
}
