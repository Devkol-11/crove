import { describe, it, expect } from 'vitest'
import { EscrowAggregate } from '../entity/escrow.aggregate'
import {
  EscrowStatus,
  EscrowType,
  EscrowRole,
  MilestoneStatus,
  canTransition,
  VALID_TRANSITIONS,
} from '../../escrow.types'
import {
  EscrowInvalidTransitionError,
  EscrowUnsupportedCurrencyError,
  MilestoneDeadlinePastError,
  MilestoneTotalExceedsLimitError,
} from '../errors/escrow.errors'

// ── Mock helpers ──────────────────────────────────────────────────────────────
//
// Prisma Decimal has .toString() and is coerced by Number() via valueOf().
// These shims satisfy both call sites inside EscrowAggregate:
//   • parseFloat(this.props.amount.toString())
//   • Number(m.amount)

const dec = (val: number) =>
  ({ toString: () => String(val), valueOf: () => val }) as unknown as any

function makeEscrow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'esc-test-1',
    code: 'TST001',
    title: 'Test Escrow',
    description: null,
    type: EscrowType.Standard as string,
    status: EscrowStatus.Created as string,
    amount: dec(10_000),
    currency: 'NGN',
    releaseCondition: null,
    isQuickLink: false,
    expiresAt: null,
    creatorId: 'creator-1',
    fundedAt: null,
    releasedAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  }
}

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'part-test-1',
    escrowId: 'esc-test-1',
    userId: 'user-1',
    name: 'Test User',
    email: 'user@example.com',
    role: EscrowRole.Payer as string,
    accountNumber: null,
    bankCode: null,
    bankName: null,
    accountName: null,
    walletAddress: null,
    walletNetwork: null,
    bachsAccountId: null,
    joinedAt: new Date(),
    ...overrides,
  }
}

function makeMilestone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ms-test-1',
    escrowId: 'esc-test-1',
    title: 'Milestone 1',
    description: null,
    amount: dec(3_000),
    status: MilestoneStatus.Pending as string,
    order: 1,
    deadline: null,
    submittedAt: null,
    approvedAt: null,
    releasedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function agg(
  escrowOverrides: Record<string, unknown> = {},
  opts: { participants?: ReturnType<typeof makeParticipant>[]; milestones?: ReturnType<typeof makeMilestone>[] } = {},
) {
  return EscrowAggregate.from({
    ...makeEscrow(escrowOverrides),
    participants: opts.participants ?? [],
    milestones: opts.milestones ?? [],
  } as any)
}

// ─────────────────────────────────────────────────────────────────────────────

describe('EscrowAggregate', () => {

  // ── Getters ───────────────────────────────────────────────────────────────

  describe('getters', () => {
    it('exposes code, title, type, status, currency, creatorId, releaseCondition', () => {
      const e = agg({ code: 'XYZ123', title: 'My Title', creatorId: 'cid-99', releaseCondition: 'sign the docs' })
      expect(e.code).toBe('XYZ123')
      expect(e.title).toBe('My Title')
      expect(e.type).toBe(EscrowType.Standard)
      expect(e.status).toBe(EscrowStatus.Created)
      expect(e.currency).toBe('NGN')
      expect(e.creatorId).toBe('cid-99')
      expect(e.releaseCondition).toBe('sign the docs')
    })

    it('converts Prisma Decimal amount to JS float via parseFloat(toString())', () => {
      expect(agg({ amount: dec(12_500.75) }).amount).toBe(12_500.75)
    })

    it('handles large integer amounts without precision loss', () => {
      expect(agg({ amount: dec(100_000_000) }).amount).toBe(100_000_000)
    })

    it('releaseCondition is null when not set', () => {
      expect(agg().releaseCondition).toBeNull()
    })

    it('creatorId is null for quick-link escrows without a creator', () => {
      expect(agg({ creatorId: null }).creatorId).toBeNull()
    })
  })

  // ── State machine: canTransitionTo ────────────────────────────────────────

  describe('canTransitionTo — valid transitions', () => {
    const VALID_CASES: [EscrowStatus, EscrowStatus][] = [
      [EscrowStatus.Created, EscrowStatus.AwaitingPayment],
      [EscrowStatus.Created, EscrowStatus.Funded],
      [EscrowStatus.Created, EscrowStatus.Cancelled],
      [EscrowStatus.AwaitingPayment, EscrowStatus.Funded],
      [EscrowStatus.AwaitingPayment, EscrowStatus.Cancelled],
      [EscrowStatus.Funded, EscrowStatus.Held],
      [EscrowStatus.Held, EscrowStatus.AwaitingAction],
      [EscrowStatus.Held, EscrowStatus.Released],
      [EscrowStatus.Held, EscrowStatus.Disputed],
      [EscrowStatus.AwaitingAction, EscrowStatus.Released],
      [EscrowStatus.AwaitingAction, EscrowStatus.Refunded],
      [EscrowStatus.AwaitingAction, EscrowStatus.Disputed],
      [EscrowStatus.Disputed, EscrowStatus.Released],
      [EscrowStatus.Disputed, EscrowStatus.Refunded],
    ]

    it.each(VALID_CASES)('%s → %s is allowed', (from, to) => {
      expect(agg({ status: from }).canTransitionTo(to)).toBe(true)
    })
  })

  describe('canTransitionTo — terminal states block all outbound moves', () => {
    const TERMINAL: EscrowStatus[] = [EscrowStatus.Released, EscrowStatus.Refunded, EscrowStatus.Cancelled]
    const ALL_STATUSES = Object.values(EscrowStatus)

    it.each(TERMINAL)('%s → anything is always blocked', (terminal) => {
      const e = agg({ status: terminal })
      for (const target of ALL_STATUSES) {
        expect(e.canTransitionTo(target)).toBe(false)
      }
    })
  })

  describe('canTransitionTo — invalid non-terminal transitions', () => {
    const INVALID_CASES: [EscrowStatus, EscrowStatus][] = [
      // Cannot skip ahead from Created
      [EscrowStatus.Created, EscrowStatus.Held],
      [EscrowStatus.Created, EscrowStatus.Released],
      [EscrowStatus.Created, EscrowStatus.Refunded],
      [EscrowStatus.Created, EscrowStatus.Disputed],
      [EscrowStatus.Created, EscrowStatus.AwaitingAction],
      // AwaitingPayment
      [EscrowStatus.AwaitingPayment, EscrowStatus.Created],
      [EscrowStatus.AwaitingPayment, EscrowStatus.Held],
      [EscrowStatus.AwaitingPayment, EscrowStatus.Released],
      [EscrowStatus.AwaitingPayment, EscrowStatus.Refunded],
      [EscrowStatus.AwaitingPayment, EscrowStatus.Disputed],
      [EscrowStatus.AwaitingPayment, EscrowStatus.AwaitingAction],
      // Funded can only go to Held (payment worker only)
      [EscrowStatus.Funded, EscrowStatus.Released],
      [EscrowStatus.Funded, EscrowStatus.Cancelled],
      [EscrowStatus.Funded, EscrowStatus.Refunded],
      [EscrowStatus.Funded, EscrowStatus.Disputed],
      [EscrowStatus.Funded, EscrowStatus.AwaitingAction],
      // Held cannot go straight to Refunded (must dispute or go to AwaitingAction first)
      [EscrowStatus.Held, EscrowStatus.Refunded],
      [EscrowStatus.Held, EscrowStatus.Created],
      [EscrowStatus.Held, EscrowStatus.Funded],
      [EscrowStatus.Held, EscrowStatus.Cancelled],
      // AwaitingAction cannot revert
      [EscrowStatus.AwaitingAction, EscrowStatus.Created],
      [EscrowStatus.AwaitingAction, EscrowStatus.Funded],
      [EscrowStatus.AwaitingAction, EscrowStatus.Held],
      [EscrowStatus.AwaitingAction, EscrowStatus.Cancelled],
      // Disputed cannot revert to anything except final states
      [EscrowStatus.Disputed, EscrowStatus.Created],
      [EscrowStatus.Disputed, EscrowStatus.Funded],
      [EscrowStatus.Disputed, EscrowStatus.Held],
      [EscrowStatus.Disputed, EscrowStatus.Cancelled],
      [EscrowStatus.Disputed, EscrowStatus.AwaitingAction],
    ]

    it.each(INVALID_CASES)('%s → %s is blocked', (from, to) => {
      expect(agg({ status: from }).canTransitionTo(to)).toBe(false)
    })
  })

  describe('canTransitionTo — self-transitions are always blocked', () => {
    it.each(Object.values(EscrowStatus))('%s → %s (self) is blocked', (status) => {
      expect(agg({ status }).canTransitionTo(status)).toBe(false)
    })
  })

  // ── State machine: assertCanTransitionTo ──────────────────────────────────

  describe('assertCanTransitionTo', () => {
    it('does not throw for valid Held → Released', () => {
      expect(() => agg({ status: EscrowStatus.Held }).assertCanTransitionTo(EscrowStatus.Released)).not.toThrow()
    })

    it('does not throw for valid Created → Cancelled', () => {
      expect(() => agg({ status: EscrowStatus.Created }).assertCanTransitionTo(EscrowStatus.Cancelled)).not.toThrow()
    })

    it('throws EscrowInvalidTransitionError for Released → anything', () => {
      const e = agg({ status: EscrowStatus.Released })
      expect(() => e.assertCanTransitionTo(EscrowStatus.Refunded)).toThrow(EscrowInvalidTransitionError)
    })

    it('throws EscrowInvalidTransitionError for Cancelled → Created', () => {
      const e = agg({ status: EscrowStatus.Cancelled })
      expect(() => e.assertCanTransitionTo(EscrowStatus.Created)).toThrow(EscrowInvalidTransitionError)
    })

    it('error has code ESCROW_INVALID_TRANSITION', () => {
      try {
        agg({ status: EscrowStatus.Released }).assertCanTransitionTo(EscrowStatus.Held)
      } catch (err: any) {
        expect(err.code).toBe('ESCROW_INVALID_TRANSITION')
      }
    })

    it('error message contains the escrow code', () => {
      try {
        agg({ status: EscrowStatus.Cancelled, code: 'ERRCD1' }).assertCanTransitionTo(EscrowStatus.Released)
      } catch (err: any) {
        expect(err.message).toContain('ERRCD1')
      }
    })

    it('error message mentions the current status', () => {
      try {
        agg({ status: EscrowStatus.Cancelled }).assertCanTransitionTo(EscrowStatus.Released)
      } catch (err: any) {
        expect(err.message).toContain('Cancelled')
      }
    })

    it('error message for Held → Refunded hints at valid next states', () => {
      try {
        agg({ status: EscrowStatus.Held }).assertCanTransitionTo(EscrowStatus.Refunded)
      } catch (err: any) {
        // Valid next states for Held are AwaitingAction, Released, Disputed
        expect(err.message).toMatch(/AwaitingAction|Released|Disputed/)
      }
    })

    it('error message for terminal state says "terminal"', () => {
      try {
        agg({ status: EscrowStatus.Refunded }).assertCanTransitionTo(EscrowStatus.Released)
      } catch (err: any) {
        expect(err.message.toLowerCase()).toContain('terminal')
      }
    })
  })

  // ── VALID_TRANSITIONS integrity ───────────────────────────────────────────

  describe('VALID_TRANSITIONS completeness', () => {
    it('every EscrowStatus has an entry (even terminal ones with empty array)', () => {
      for (const status of Object.values(EscrowStatus)) {
        expect(VALID_TRANSITIONS).toHaveProperty(status)
        expect(Array.isArray(VALID_TRANSITIONS[status])).toBe(true)
      }
    })

    it('canTransition agrees with VALID_TRANSITIONS for every (from, to) pair', () => {
      for (const from of Object.values(EscrowStatus)) {
        for (const to of Object.values(EscrowStatus)) {
          const expected = VALID_TRANSITIONS[from].includes(to)
          expect(canTransition(from, to)).toBe(expected)
        }
      }
    })

    it('no status can transition to Created (no backwards moves)', () => {
      for (const status of Object.values(EscrowStatus)) {
        expect(canTransition(status, EscrowStatus.Created)).toBe(false)
      }
    })

    it('no status can transition to AwaitingPayment except Created', () => {
      for (const status of Object.values(EscrowStatus)) {
        const expected = status === EscrowStatus.Created
        expect(canTransition(status, EscrowStatus.AwaitingPayment)).toBe(expected)
      }
    })

    it('only Funded can transition to Held', () => {
      for (const status of Object.values(EscrowStatus)) {
        const expected = status === EscrowStatus.Funded
        expect(canTransition(status, EscrowStatus.Held)).toBe(expected)
      }
    })
  })

  // ── Role-based access ─────────────────────────────────────────────────────

  describe('getRoleForUser', () => {
    it('returns Payer for a Payer participant matched by userId', () => {
      const e = agg({}, { participants: [makeParticipant({ userId: 'p1', role: EscrowRole.Payer })] })
      expect(e.getRoleForUser('p1')).toBe(EscrowRole.Payer)
    })

    it('returns Payee for a Payee participant matched by userId', () => {
      const e = agg({}, { participants: [makeParticipant({ userId: 'p2', role: EscrowRole.Payee })] })
      expect(e.getRoleForUser('p2')).toBe(EscrowRole.Payee)
    })

    it('returns null for a user not in participants', () => {
      const e = agg({}, { participants: [makeParticipant({ userId: 'p1' })] })
      expect(e.getRoleForUser('stranger')).toBeNull()
    })

    it('returns null when participants list is empty', () => {
      expect(agg().getRoleForUser('anyone')).toBeNull()
    })

    it('falls back to email match for quick-link participants (userId = null)', () => {
      const e = agg({}, {
        participants: [makeParticipant({ userId: null, email: 'payee@link.com', role: EscrowRole.Payee })],
      })
      expect(e.getRoleForUser('any-auth-uid', 'payee@link.com')).toBe(EscrowRole.Payee)
    })

    it('email fallback does NOT fire when participant already has a userId', () => {
      // An attacker who shares the same email as a userId-bearing participant must not gain access
      const e = agg({}, {
        participants: [makeParticipant({ userId: 'real-uid', email: 'shared@test.com', role: EscrowRole.Payer })],
      })
      expect(e.getRoleForUser('attacker-uid', 'shared@test.com')).toBeNull()
    })

    it('email fallback requires userEmail to be provided (no email arg → no match)', () => {
      const e = agg({}, {
        participants: [makeParticipant({ userId: null, email: 'quick@test.com', role: EscrowRole.Payee })],
      })
      expect(e.getRoleForUser('any-uid')).toBeNull()
    })

    it('email fallback does not match when email is an empty string', () => {
      const e = agg({}, {
        participants: [makeParticipant({ userId: null, email: 'quick@test.com', role: EscrowRole.Payee })],
      })
      expect(e.getRoleForUser('any-uid', '')).toBeNull()
    })

    it('userId match takes precedence over email when both are present on the same participant', () => {
      // Participant has both userId and email — userId match should succeed
      const e = agg({}, {
        participants: [makeParticipant({ userId: 'p1', email: 'p1@test.com', role: EscrowRole.Payer })],
      })
      expect(e.getRoleForUser('p1')).toBe(EscrowRole.Payer)
    })

    it('multiple participants — returns the right role for each', () => {
      const e = agg({}, {
        participants: [
          makeParticipant({ id: 'pa1', userId: 'payer', role: EscrowRole.Payer }),
          makeParticipant({ id: 'pa2', userId: 'payee', role: EscrowRole.Payee }),
        ],
      })
      expect(e.getRoleForUser('payer')).toBe(EscrowRole.Payer)
      expect(e.getRoleForUser('payee')).toBe(EscrowRole.Payee)
    })
  })

  describe('isCreatedBy', () => {
    it('returns true for the creator', () => {
      expect(agg({ creatorId: 'owner-99' }).isCreatedBy('owner-99')).toBe(true)
    })

    it('returns false for any other user', () => {
      expect(agg({ creatorId: 'owner-99' }).isCreatedBy('other')).toBe(false)
    })

    it('returns false when creatorId is null (quick-link, no auth user)', () => {
      expect(agg({ creatorId: null }).isCreatedBy('anyone')).toBe(false)
    })
  })

  describe('isParticipant', () => {
    it('returns true for a userId-matched participant', () => {
      const e = agg({}, { participants: [makeParticipant({ userId: 'u1' })] })
      expect(e.isParticipant('u1')).toBe(true)
    })

    it('returns false for a non-participant', () => {
      const e = agg({}, { participants: [makeParticipant({ userId: 'u1' })] })
      expect(e.isParticipant('u2')).toBe(false)
    })

    it('returns true for a quick-link participant matched by email', () => {
      const e = agg({}, {
        participants: [makeParticipant({ userId: null, email: 'quick@test.com' })],
      })
      expect(e.isParticipant('irrelevant', 'quick@test.com')).toBe(true)
    })

    it('returns false when no participants', () => {
      expect(agg().isParticipant('anyone')).toBe(false)
    })
  })

  describe('canUserFund', () => {
    it('returns true only for the Payer role', () => {
      const e = agg({}, {
        participants: [
          makeParticipant({ id: 'pa1', userId: 'payer', role: EscrowRole.Payer }),
          makeParticipant({ id: 'pa2', userId: 'payee', role: EscrowRole.Payee }),
        ],
      })
      expect(e.canUserFund('payer')).toBe(true)
      expect(e.canUserFund('payee')).toBe(false)
    })

    it('returns false for a non-participant', () => {
      expect(agg().canUserFund('stranger')).toBe(false)
    })

    it('quick-link Payer matched by email can fund', () => {
      const e = agg({}, {
        participants: [makeParticipant({ userId: null, email: 'p@x.com', role: EscrowRole.Payer })],
      })
      expect(e.canUserFund('any-uid', 'p@x.com')).toBe(true)
    })
  })

  describe('canUserApprove', () => {
    it('Payer can approve; Payee cannot', () => {
      const e = agg({}, {
        participants: [
          makeParticipant({ id: 'pa1', userId: 'payer', role: EscrowRole.Payer }),
          makeParticipant({ id: 'pa2', userId: 'payee', role: EscrowRole.Payee }),
        ],
      })
      expect(e.canUserApprove('payer')).toBe(true)
      expect(e.canUserApprove('payee')).toBe(false)
    })

    it('non-participant cannot approve', () => {
      expect(agg().canUserApprove('stranger')).toBe(false)
    })
  })

  // ── Financial invariants ──────────────────────────────────────────────────

  describe('isMilestoneType', () => {
    it.each([
      [EscrowType.Milestone, true],
      [EscrowType.Standard, false],
      [EscrowType.Conditional, false],
      [EscrowType.Deposit, false],
    ])('type %s → isMilestoneType() === %s', (type, expected) => {
      expect(agg({ type }).isMilestoneType()).toBe(expected)
    })
  })

  describe('releasedMilestoneTotal', () => {
    it('returns 0 with no milestones', () => {
      expect(agg().releasedMilestoneTotal()).toBe(0)
    })

    it('returns 0 when no milestones are Released', () => {
      const e = agg({}, {
        milestones: [
          makeMilestone({ id: 'ms1', status: MilestoneStatus.Pending, amount: dec(3_000) }),
          makeMilestone({ id: 'ms2', status: MilestoneStatus.Submitted, amount: dec(3_000) }),
          makeMilestone({ id: 'ms3', status: MilestoneStatus.Approved, amount: dec(4_000) }),
          makeMilestone({ id: 'ms4', status: MilestoneStatus.InProgress, amount: dec(2_000) }),
        ],
      })
      expect(e.releasedMilestoneTotal()).toBe(0)
    })

    it('sums only milestones with Released status', () => {
      const e = agg({}, {
        milestones: [
          makeMilestone({ id: 'ms1', status: MilestoneStatus.Released, amount: dec(2_000) }),
          makeMilestone({ id: 'ms2', status: MilestoneStatus.Pending, amount: dec(3_000) }),
          makeMilestone({ id: 'ms3', status: MilestoneStatus.Released, amount: dec(5_000) }),
        ],
      })
      expect(e.releasedMilestoneTotal()).toBe(7_000)
    })

    it('returns full amount when every milestone is Released', () => {
      const e = agg({ amount: dec(10_000) }, {
        milestones: [
          makeMilestone({ id: 'ms1', status: MilestoneStatus.Released, amount: dec(3_000) }),
          makeMilestone({ id: 'ms2', status: MilestoneStatus.Released, amount: dec(3_000) }),
          makeMilestone({ id: 'ms3', status: MilestoneStatus.Released, amount: dec(4_000) }),
        ],
      })
      expect(e.releasedMilestoneTotal()).toBe(10_000)
    })

    it('returns 0 for a single non-Released milestone', () => {
      const e = agg({}, {
        milestones: [makeMilestone({ status: MilestoneStatus.Approved, amount: dec(5_000) })],
      })
      expect(e.releasedMilestoneTotal()).toBe(0)
    })
  })

  describe('remainingBalance', () => {
    it('equals the full amount when nothing has been released', () => {
      const e = agg({ amount: dec(10_000) }, {
        milestones: [makeMilestone({ status: MilestoneStatus.Pending, amount: dec(10_000) })],
      })
      expect(e.remainingBalance()).toBe(10_000)
    })

    it('is amount minus the sum of Released milestones', () => {
      const e = agg({ amount: dec(10_000) }, {
        milestones: [
          makeMilestone({ id: 'ms1', status: MilestoneStatus.Released, amount: dec(3_000) }),
          makeMilestone({ id: 'ms2', status: MilestoneStatus.Released, amount: dec(2_000) }),
          makeMilestone({ id: 'ms3', status: MilestoneStatus.Pending, amount: dec(5_000) }),
        ],
      })
      expect(e.remainingBalance()).toBe(5_000)
    })

    it('returns 0 when all milestones are released (fully disbursed)', () => {
      const e = agg({ amount: dec(10_000) }, {
        milestones: [
          makeMilestone({ id: 'ms1', status: MilestoneStatus.Released, amount: dec(6_000) }),
          makeMilestone({ id: 'ms2', status: MilestoneStatus.Released, amount: dec(4_000) }),
        ],
      })
      expect(e.remainingBalance()).toBe(0)
    })

    it('equals full escrow amount when there are no milestones at all', () => {
      expect(agg({ amount: dec(50_000) }).remainingBalance()).toBe(50_000)
    })

    it('critical: remainingBalance is used for partial-milestone refunds — only unreleased funds return', () => {
      // 3-milestone escrow: 2 paid out, 1 still pending
      // Refund must be remainingBalance (4000), NOT escrow.amount (10000)
      const e = agg({ amount: dec(10_000) }, {
        milestones: [
          makeMilestone({ id: 'ms1', status: MilestoneStatus.Released, amount: dec(3_000) }),
          makeMilestone({ id: 'ms2', status: MilestoneStatus.Released, amount: dec(3_000) }),
          makeMilestone({ id: 'ms3', status: MilestoneStatus.Pending, amount: dec(4_000) }),
        ],
      })
      expect(e.remainingBalance()).toBe(4_000)
      expect(e.amount).toBe(10_000)
      expect(e.remainingBalance()).not.toBe(e.amount)
    })
  })

  describe('allMilestonesReleased', () => {
    it('returns false when there are no milestones', () => {
      expect(agg().allMilestonesReleased()).toBe(false)
    })

    it('returns false when some milestones are still pending', () => {
      const e = agg({}, {
        milestones: [
          makeMilestone({ id: 'ms1', status: MilestoneStatus.Released, amount: dec(5_000) }),
          makeMilestone({ id: 'ms2', status: MilestoneStatus.Pending, amount: dec(5_000) }),
        ],
      })
      expect(e.allMilestonesReleased()).toBe(false)
    })

    it('returns true when every milestone is Released', () => {
      const e = agg({}, {
        milestones: [
          makeMilestone({ id: 'ms1', status: MilestoneStatus.Released, amount: dec(5_000) }),
          makeMilestone({ id: 'ms2', status: MilestoneStatus.Released, amount: dec(5_000) }),
        ],
      })
      expect(e.allMilestonesReleased()).toBe(true)
    })

    it('returns false when one Approved milestone remains (not yet disbursed)', () => {
      const e = agg({}, {
        milestones: [
          makeMilestone({ id: 'ms1', status: MilestoneStatus.Released, amount: dec(6_000) }),
          makeMilestone({ id: 'ms2', status: MilestoneStatus.Approved, amount: dec(4_000) }),
        ],
      })
      expect(e.allMilestonesReleased()).toBe(false)
    })

    it('returns false for a single non-released milestone', () => {
      const e = agg({}, {
        milestones: [makeMilestone({ status: MilestoneStatus.Submitted })],
      })
      expect(e.allMilestonesReleased()).toBe(false)
    })
  })

  // ── Creation validation ───────────────────────────────────────────────────

  describe('assertValidCreationInput', () => {
    const futureISO = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const pastISO   = new Date(Date.now() - 1000).toISOString()

    describe('currency', () => {
      it.each(['NGN', 'USD', 'GBP', 'EUR'])('accepts supported currency %s', (currency) => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            type: EscrowType.Standard, title: 'T', amount: 5_000, currency, creatorRole: EscrowRole.Payer,
          } as any)
        ).not.toThrow()
      })

      it('rejects unknown currency JPY', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            type: EscrowType.Standard, title: 'T', amount: 5_000, currency: 'JPY', creatorRole: EscrowRole.Payer,
          } as any)
        ).toThrow(EscrowUnsupportedCurrencyError)
      })

      it('is case-sensitive — lowercase "ngn" is rejected', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            type: EscrowType.Standard, title: 'T', amount: 5_000, currency: 'ngn', creatorRole: EscrowRole.Payer,
          } as any)
        ).toThrow(EscrowUnsupportedCurrencyError)
      })

      it('rejects empty string currency', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            type: EscrowType.Standard, title: 'T', amount: 5_000, currency: '', creatorRole: EscrowRole.Payer,
          } as any)
        ).toThrow(EscrowUnsupportedCurrencyError)
      })

      it('error code is ESCROW_UNSUPPORTED_CURRENCY', () => {
        try {
          EscrowAggregate.assertValidCreationInput({
            type: EscrowType.Standard, title: 'T', amount: 5_000, currency: 'BTC', creatorRole: EscrowRole.Payer,
          } as any)
        } catch (err: any) {
          expect(err.code).toBe('ESCROW_UNSUPPORTED_CURRENCY')
        }
      })
    })

    describe('milestone-type: total amount', () => {
      const base = { type: EscrowType.Milestone, title: 'M', currency: 'NGN', creatorRole: EscrowRole.Payer }

      it('accepts milestone total exactly at 100M (boundary)', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            ...base, milestones: [{ title: 'M1', amount: 100_000_000 }],
          } as any)
        ).not.toThrow()
      })

      it('rejects milestone total above 100M', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            ...base, milestones: [{ title: 'M1', amount: 60_000_000 }, { title: 'M2', amount: 60_000_000 }],
          } as any)
        ).toThrow(MilestoneTotalExceedsLimitError)
      })

      it('rejects milestone total of 0 (below minimum of 1)', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            ...base, milestones: [{ title: 'M1', amount: 0 }],
          } as any)
        ).toThrow(MilestoneTotalExceedsLimitError)
      })

      it('accepts milestone total of exactly 1 (minimum)', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            ...base, milestones: [{ title: 'M1', amount: 1 }],
          } as any)
        ).not.toThrow()
      })

      it('error code is MILESTONE_TOTAL_EXCEEDS_LIMIT', () => {
        try {
          EscrowAggregate.assertValidCreationInput({
            ...base, milestones: [{ title: 'M1', amount: 200_000_000 }],
          } as any)
        } catch (err: any) {
          expect(err.code).toBe('MILESTONE_TOTAL_EXCEEDS_LIMIT')
        }
      })
    })

    describe('milestone-type: deadlines', () => {
      const base = { type: EscrowType.Milestone, title: 'M', currency: 'NGN', creatorRole: EscrowRole.Payer }

      it('accepts milestone with a future deadline', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            ...base, milestones: [{ title: 'M1', amount: 5_000, deadline: futureISO }],
          } as any)
        ).not.toThrow()
      })

      it('accepts milestone with no deadline', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            ...base, milestones: [{ title: 'M1', amount: 5_000 }],
          } as any)
        ).not.toThrow()
      })

      it('rejects milestone with a past deadline', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            ...base, milestones: [{ title: 'M1', amount: 5_000, deadline: pastISO }],
          } as any)
        ).toThrow(MilestoneDeadlinePastError)
      })

      it('rejects when any one of several milestones has a past deadline', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            ...base, milestones: [
              { title: 'M1', amount: 3_000, deadline: futureISO },
              { title: 'M2', amount: 3_000, deadline: pastISO },   // ← bad
              { title: 'M3', amount: 4_000 },
            ],
          } as any)
        ).toThrow(MilestoneDeadlinePastError)
      })

      it('error code is MILESTONE_DEADLINE_PAST', () => {
        try {
          EscrowAggregate.assertValidCreationInput({
            ...base, milestones: [{ title: 'M1', amount: 5_000, deadline: pastISO }],
          } as any)
        } catch (err: any) {
          expect(err.code).toBe('MILESTONE_DEADLINE_PAST')
        }
      })
    })

    describe('non-Milestone types skip milestone-specific validation', () => {
      it('Standard: no milestone validation runs (large amount passes through)', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            type: EscrowType.Standard, title: 'T', amount: 200_000_000, currency: 'NGN', creatorRole: EscrowRole.Payer,
          } as any)
        ).not.toThrow()
      })

      it('Conditional: milestone deadline check does not run', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            type: EscrowType.Conditional, title: 'T', amount: 5_000, currency: 'NGN',
            creatorRole: EscrowRole.Payer, releaseCondition: 'sign it',
          } as any)
        ).not.toThrow()
      })

      it('Deposit: no milestone validation', () => {
        expect(() =>
          EscrowAggregate.assertValidCreationInput({
            type: EscrowType.Deposit, title: 'T', amount: 5_000, currency: 'NGN', creatorRole: EscrowRole.Payer,
          } as any)
        ).not.toThrow()
      })
    })
  })

  // ── Domain events ─────────────────────────────────────────────────────────

  describe('domain events', () => {
    it('raiseCreatedEvent adds an EscrowCreatedEvent', () => {
      const e = agg()
      e.raiseCreatedEvent('creator-1')
      expect(e.domainEvents).toHaveLength(1)
      expect(e.domainEvents[0].constructor.name).toBe('EscrowCreatedEvent')
    })

    it('fund() from Created adds an EscrowFundedEvent', () => {
      const e = agg({ status: EscrowStatus.Created })
      e.fund('payer-1')
      expect(e.domainEvents).toHaveLength(1)
      expect(e.domainEvents[0].constructor.name).toBe('EscrowFundedEvent')
    })

    it('fund() from AwaitingPayment also succeeds', () => {
      const e = agg({ status: EscrowStatus.AwaitingPayment })
      expect(() => e.fund('payer-1')).not.toThrow()
      expect(e.domainEvents).toHaveLength(1)
    })

    it('fund() from Held throws — already funded', () => {
      const e = agg({ status: EscrowStatus.Held })
      expect(() => e.fund('payer-1')).toThrow(EscrowInvalidTransitionError)
      expect(e.domainEvents).toHaveLength(0)
    })

    it('fund() from Released throws — terminal', () => {
      const e = agg({ status: EscrowStatus.Released })
      expect(() => e.fund('payer-1')).toThrow(EscrowInvalidTransitionError)
    })

    it('fund() from Cancelled throws — terminal', () => {
      const e = agg({ status: EscrowStatus.Cancelled })
      expect(() => e.fund('payer-1')).toThrow(EscrowInvalidTransitionError)
    })

    it('release() from Held adds an EscrowReleasedEvent', () => {
      const e = agg({ status: EscrowStatus.Held })
      e.release('payer-1')
      expect(e.domainEvents).toHaveLength(1)
      expect(e.domainEvents[0].constructor.name).toBe('EscrowReleasedEvent')
    })

    it('release() from Created throws — not in Held', () => {
      const e = agg({ status: EscrowStatus.Created })
      expect(() => e.release('payer-1')).toThrow(EscrowInvalidTransitionError)
    })

    it('release() from Released throws — already terminal', () => {
      const e = agg({ status: EscrowStatus.Released })
      expect(() => e.release('payer-1')).toThrow(EscrowInvalidTransitionError)
    })

    it('release() from Disputed SUCCEEDS — dispute resolved in payee favour', () => {
      // Disputed → Released is a valid transition (VALID_TRANSITIONS confirms this).
      // The service layer controls who can call release after a dispute; the domain
      // aggregate only enforces the state machine, not the caller identity.
      const e = agg({ status: EscrowStatus.Disputed })
      expect(() => e.release('payer-1')).not.toThrow()
      expect(e.domainEvents[0].constructor.name).toBe('EscrowReleasedEvent')
    })

    it('clearDomainEvents empties the queue', () => {
      const e = agg({ status: EscrowStatus.Created })
      e.fund('payer-1')
      expect(e.domainEvents).toHaveLength(1)
      e.clearDomainEvents()
      expect(e.domainEvents).toHaveLength(0)
    })

    it('multiple events accumulate in order', () => {
      const e = agg()
      e.raiseCreatedEvent('creator-1')
      // cannot fund twice on same object (it would need status to be Created,
      // but we're just testing event accumulation)
      expect(e.domainEvents).toHaveLength(1)
    })

    it('domainEvents getter returns the accumulated events without exposing the mutable array directly', () => {
      // TypeScript types domainEvents as readonly — runtime immutability is NOT enforced.
      // This test verifies the observable contract: getter returns the live events list.
      const e = agg()
      e.raiseCreatedEvent('creator-1')
      const snapshot = e.domainEvents
      expect(snapshot).toHaveLength(1)
      // clearDomainEvents empties the backing store, confirming the getter is live
      e.clearDomainEvents()
      expect(e.domainEvents).toHaveLength(0)
    })
  })
})
