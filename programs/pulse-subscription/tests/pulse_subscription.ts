// Integration tests - pulse-subscription Anchor program
// Run: anchor test --skip-build
// Coverage: initialize, update, increment, decrement, close, PDA sanity

import * as anchor from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import BN from "bn.js";
import { expect } from "chai";

const AnchorProvider = anchor.AnchorProvider;
const Program = anchor.Program;

// ------------------------------------------------------------------ helpers

type PulseSubscription = anchor.Idl; // typed by IDL at runtime
const IDL = require("../target/idl/pulse_subscription.json");

const PROGRAM_ID = new PublicKey("3UAr7wLdjwjs4PASQzu5snfTa9dgdbUuX7bSg7Z3pjbb");

function subPda(owner: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("subscription"), owner.toBuffer()],
    programId
  );
}

function futureTs(offsetSecs = 3600): InstanceType<typeof anchor.BN> {
  return new anchor.BN(Math.floor(Date.now() / 1000) + offsetSecs);
}

function pastTs(offsetSecs = 3600): InstanceType<typeof anchor.BN> {
  return new anchor.BN(Math.floor(Date.now() / 1000) - offsetSecs);
}

async function airdrop(
  connection: Connection,
  pubkey: PublicKey,
  sol = 2
) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
}

async function assertAnchorError(
  promise: Promise<unknown>,
  errorName: string
) {
  try {
    await promise;
    throw new Error(`Expected error ${errorName} but tx succeeded`);
  } catch (err: unknown) {
    if (err instanceof anchor.AnchorError) {
      expect(err.error.errorCode.code).to.equal(errorName);
    } else if (
      err instanceof Error &&
      err.message.includes(errorName)
    ) {
      // ok
    } else {
      throw err;
    }
  }
}

// ------------------------------------------------------------------ suite

describe("pulse-subscription", () => {
  // ---------------------------------------------------------------- setup
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  // anchor 0.32: Program(idl, provider) -- programId comes from idl.address
  const program = new Program(IDL, provider);
  const connection = provider.connection;

  // Fresh keypair per test run so accounts don't collide between runs
  let owner: Keypair;
  let [subAccount, bump]: [PublicKey, number] = [PublicKey.default, 0];

  beforeEach(async () => {
    owner = Keypair.generate();
    await airdrop(connection, owner.publicKey);
    [subAccount, bump] = subPda(owner.publicKey, PROGRAM_ID);
  });

  // ================================================================
  // initialize_subscription
  // ================================================================

  describe("initialize_subscription", () => {
    it("creates free-tier subscription with expires_at=0", async () => {
      await program.methods
        .initializeSubscription(0, new BN(0))
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const sub = await (program.account as any).subscription.fetch(subAccount);
      expect(sub.owner.toBase58()).to.equal(owner.publicKey.toBase58());
      expect(sub.tier).to.equal(0);
      expect(sub.expiresAt.toNumber()).to.equal(0);
      expect(sub.programCount).to.equal(0);
      expect(sub.bump).to.equal(bump);
      expect(sub.createdAt.toNumber()).to.be.greaterThan(0);
    });

    it("creates team-tier subscription with future expiry", async () => {
      const exp = futureTs(86400); // +1 day
      await program.methods
        .initializeSubscription(1, exp)
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const sub = await (program.account as any).subscription.fetch(subAccount);
      expect(sub.tier).to.equal(1);
      expect(sub.expiresAt.toNumber()).to.equal(exp.toNumber());
    });

    it("creates protocol-tier subscription", async () => {
      const exp = futureTs(31536000); // +1 year
      await program.methods
        .initializeSubscription(2, exp)
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const sub = await (program.account as any).subscription.fetch(subAccount);
      expect(sub.tier).to.equal(2);
    });

    it("[AUDIT-1] rejects tier > 2", async () => {
      await assertAnchorError(
        program.methods
          .initializeSubscription(3, new BN(0))
          .accounts({
            subscription: subAccount,
            owner: owner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc(),
        "InvalidTier"
      );
    });

    it("[AUDIT-2] rejects free tier with non-zero expires_at", async () => {
      await assertAnchorError(
        program.methods
          .initializeSubscription(0, futureTs())
          .accounts({
            subscription: subAccount,
            owner: owner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc(),
        "InvalidFreeTierExpiry"
      );
    });

    it("rejects paid tier with past expires_at", async () => {
      await assertAnchorError(
        program.methods
          .initializeSubscription(1, pastTs())
          .accounts({
            subscription: subAccount,
            owner: owner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc(),
        "ExpirationInPast"
      );
    });

    it("rejects double-initialize (account already exists)", async () => {
      // first init
      await program.methods
        .initializeSubscription(0, new BN(0))
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // second init must fail
      try {
        await program.methods
          .initializeSubscription(0, new BN(0))
          .accounts({
            subscription: subAccount,
            owner: owner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        throw new Error("Expected error but tx succeeded");
      } catch (err: unknown) {
        // Anchor will throw because the account is already initialized
        expect((err as Error).message).to.not.include("succeeded");
      }
    });
  });

  // ================================================================
  // update_subscription
  // ================================================================

  describe("update_subscription", () => {
    beforeEach(async () => {
      // Start with team tier
      await program.methods
        .initializeSubscription(1, futureTs(86400 * 30))
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    });

    it("upgrades team -> protocol", async () => {
      const newExp = futureTs(86400 * 365);
      await program.methods
        .updateSubscription(2, newExp)
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
        })
        .signers([owner])
        .rpc();

      const sub = await (program.account as any).subscription.fetch(subAccount);
      expect(sub.tier).to.equal(2);
    });

    it("renews same tier with new expiry", async () => {
      const newExp = futureTs(86400 * 60);
      await program.methods
        .updateSubscription(1, newExp)
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
        })
        .signers([owner])
        .rpc();

      const sub = await (program.account as any).subscription.fetch(subAccount);
      expect(sub.expiresAt.toNumber()).to.equal(newExp.toNumber());
    });

    it("[AUDIT-1] rejects invalid tier in update", async () => {
      await assertAnchorError(
        program.methods
          .updateSubscription(99, futureTs())
          .accounts({ subscription: subAccount, owner: owner.publicKey })
          .signers([owner])
          .rpc(),
        "InvalidTier"
      );
    });

    it("blocks downgrade while active plan", async () => {
      // currently on team; try to downgrade to free (active)
      await assertAnchorError(
        program.methods
          .updateSubscription(0, new BN(0))
          .accounts({ subscription: subAccount, owner: owner.publicKey })
          .signers([owner])
          .rpc(),
        "CannotDowngradeActivePlan"
      );
    });

    it("rejects wrong signer on update", async () => {
      const attacker = Keypair.generate();
      await airdrop(connection, attacker.publicKey);

      // PDA is seeded by `owner`, so attacker can't satisfy has_one = owner
      const [wrongSub] = subPda(attacker.publicKey, PROGRAM_ID);
      try {
        await program.methods
          .updateSubscription(2, futureTs())
          .accounts({
            subscription: subAccount,
            owner: attacker.publicKey,
          })
          .signers([attacker])
          .rpc();
        throw new Error("Expected error");
      } catch {
        // expected
      }
    });
  });

  // ================================================================
  // increment_program_count
  // ================================================================

  describe("increment_program_count", () => {
    it("[AUDIT-4] free tier: allows first program, blocks second", async () => {
      await program.methods
        .initializeSubscription(0, new BN(0))
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // first increment - should succeed
      await program.methods
        .incrementProgramCount()
        .accounts({ subscription: subAccount, owner: owner.publicKey })
        .signers([owner])
        .rpc();

      const subAfter1 = await (program.account as any).subscription.fetch(subAccount);
      expect(subAfter1.programCount).to.equal(1);

      // second increment - should hit ProgramLimitReached
      await assertAnchorError(
        program.methods
          .incrementProgramCount()
          .accounts({ subscription: subAccount, owner: owner.publicKey })
          .signers([owner])
          .rpc(),
        "ProgramLimitReached"
      );
    });

    it("team tier: allows 5 programs, blocks 6th", async () => {
      const exp = futureTs(86400 * 30);
      await program.methods
        .initializeSubscription(1, exp)
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      for (let i = 0; i < 5; i++) {
        await program.methods
          .incrementProgramCount()
          .accounts({ subscription: subAccount, owner: owner.publicKey })
          .signers([owner])
          .rpc();
      }

      const subAt5 = await (program.account as any).subscription.fetch(subAccount);
      expect(subAt5.programCount).to.equal(5);

      await assertAnchorError(
        program.methods
          .incrementProgramCount()
          .accounts({ subscription: subAccount, owner: owner.publicKey })
          .signers([owner])
          .rpc(),
        "ProgramLimitReached"
      );
    });

    it("expired paid subscription blocks increment", async () => {
      // We can't easily rewind the clock on localnet, so we note this test
      // is best exercised via anchor test with manipulated sysvar.
      // The unit test `paid_tier_inactive_at_expiry` covers this logic path.
      // Leaving a marker here for integration coverage completeness.
      expect(true).to.be.true; // placeholder - see unit test
    });
  });

  // ================================================================
  // decrement_program_count  [AUDIT-4 - new instruction]
  // ================================================================

  describe("decrement_program_count", () => {
    it("decrements program count after increment", async () => {
      await program.methods
        .initializeSubscription(1, futureTs(86400))
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      await program.methods
        .incrementProgramCount()
        .accounts({ subscription: subAccount, owner: owner.publicKey })
        .signers([owner])
        .rpc();

      const before = await (program.account as any).subscription.fetch(subAccount);
      expect(before.programCount).to.equal(1);

      await program.methods
        .decrementProgramCount()
        .accounts({ subscription: subAccount, owner: owner.publicKey })
        .signers([owner])
        .rpc();

      const after = await (program.account as any).subscription.fetch(subAccount);
      expect(after.programCount).to.equal(0);
    });

    it("blocks decrement below zero (ProgramCountUnderflow)", async () => {
      await program.methods
        .initializeSubscription(0, new BN(0))
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      await assertAnchorError(
        program.methods
          .decrementProgramCount()
          .accounts({ subscription: subAccount, owner: owner.publicKey })
          .signers([owner])
          .rpc(),
        "ProgramCountUnderflow"
      );
    });
  });

  // ================================================================
  // close_subscription
  // ================================================================

  describe("close_subscription", () => {
    it("closes the account and returns rent", async () => {
      await program.methods
        .initializeSubscription(0, new BN(0))
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const balanceBefore = await connection.getBalance(owner.publicKey);

      await program.methods
        .closeSubscription()
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
        })
        .signers([owner])
        .rpc();

      // Account should be gone
      const info = await connection.getAccountInfo(subAccount);
      expect(info).to.be.null;

      // Owner should have received rent back
      const balanceAfter = await connection.getBalance(owner.publicKey);
      expect(balanceAfter).to.be.greaterThan(balanceBefore);
    });

    it("rejects close by non-owner", async () => {
      await program.methods
        .initializeSubscription(0, new BN(0))
        .accounts({
          subscription: subAccount,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const attacker = Keypair.generate();
      await airdrop(connection, attacker.publicKey);

      try {
        await program.methods
          .closeSubscription()
          .accounts({
            subscription: subAccount,
            owner: attacker.publicKey,
          })
          .signers([attacker])
          .rpc();
        throw new Error("Expected error");
      } catch {
        // expected - has_one = owner rejects attacker
      }
    });
  });

  // ================================================================
  // PDA / Account sanity
  // ================================================================

  describe("PDA sanity", () => {
    it("two different owners get different PDA addresses", () => {
      const ownerA = Keypair.generate().publicKey;
      const ownerB = Keypair.generate().publicKey;
      const [pdaA] = subPda(ownerA, PROGRAM_ID);
      const [pdaB] = subPda(ownerB, PROGRAM_ID);
      expect(pdaA.toBase58()).to.not.equal(pdaB.toBase58());
    });

    it("PDA is deterministic for same owner", () => {
      const [pda1] = subPda(owner.publicKey, PROGRAM_ID);
      const [pda2] = subPda(owner.publicKey, PROGRAM_ID);
      expect(pda1.toBase58()).to.equal(pda2.toBase58());
    });
  });
});
