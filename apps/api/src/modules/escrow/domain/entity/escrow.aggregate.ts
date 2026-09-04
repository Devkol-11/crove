import type { Escrow, Milestone, EscrowParticipant } from '@prisma/client'
import { AggregateRoot } from '../../../../shared/base/AggregateRoot'
import {
  EscrowStatus,
  EscrowType,
  EscrowRole,
  MilestoneStatus,
  canTransition,
} from '../../escrow.types'
import type { CreateEscrowInput } from '../../escrow.schema'
import { EscrowCreatedEvent } from '../events/escrow-created.event'
import {
  EscrowInvalidTransitionError,
  EscrowUnsupportedCurrencyError,
  MilestoneDeadlinePastError,
  MilestoneTotalExceedsLimitError,
} from '../errors/escrow.errors'
import { EscrowFundedEvent } from '../events/escrow-funded.event'
import { EscrowReleasedEvent } from '../events/escrow-released.event'

type EscrowData = Escrow & {
  milestones?: Milestone[]
  participants?: EscrowParticipant[]
}

export class EscrowAggregate extends AggregateRoot<string> {
  private readonly milestones: Milestone[]
  private readonly participants: EscrowParticipant[]

  private constructor(
    private readonly props: Escrow,
    data: EscrowData,
  ) {
    super(props.id)
    this.milestones = data.milestones ?? []
    this.participants = data.participants ?? []
  }

  static from(data: EscrowData): EscrowAggregate {
    return new EscrowAggregate(data, data)
  }

  get code(): string {
    return this.props.code
  }
  get title(): string {
    return this.props.title
  }
  get type(): EscrowType {
    return this.props.type as EscrowType
  }
  get status(): EscrowStatus {
    return this.props.status as EscrowStatus
  }
  get amount(): number {
    return Number(this.props.amount)
  }
  get currency(): string {
    return this.props.currency
  }
  get creatorId(): string | null {
    return this.props.creatorId
  }
  get releaseCondition(): string | null {
    return this.props.releaseCondition
  }

  // ── State machine ─────────────────────────────────────────────────────────

  canTransitionTo(next: EscrowStatus): boolean {
    return canTransition(this.status, next)
  }

  assertCanTransitionTo(next: EscrowStatus): void {
    if (!this.canTransitionTo(next)) {
      const validNext: Record<string, string> = {
        Created: 'AwaitingPayment, Funded, Cancelled',
        AwaitingPayment: 'Funded, Cancelled',
        Funded: 'Held (auto-transition only — handled by payment worker)',
        Held: 'AwaitingAction, Released, Disputed',
        AwaitingAction: 'Released, Refunded, Disputed',
        Disputed: 'Released, Refunded (via dispute resolution)',
      }
      throw new EscrowInvalidTransitionError(
        `Escrow "${this.code}" cannot move from '${this.status}' to '${next}'. ` +
          `Valid next states: [${validNext[this.status] ?? 'none — this is a terminal state'}]`,
      )
    }
  }

  // ── Role-based access ─────────────────────────────────────────────────────
  //
  // Quick-link participants are stored with userId = null. When an authenticated
  // user accesses a quick-link escrow, match by email as a fallback so they can
  // perform participant actions. Pass the caller's email from request.authUser.

  getRoleForUser(userId: string, userEmail?: string): EscrowRole | null {
    const participant = this.participants.find(
      (p) => p.userId === userId || (p.userId === null && !!userEmail && p.email === userEmail),
    )
    return participant ? (participant.role as EscrowRole) : null
  }

  isCreatedBy(userId: string): boolean {
    return this.props.creatorId === userId
  }

  isParticipant(userId: string, userEmail?: string): boolean {
    return this.participants.some(
      (p) => p.userId === userId || (p.userId === null && !!userEmail && p.email === userEmail),
    )
  }

  canUserFund(userId: string, userEmail?: string): boolean {
    return this.getRoleForUser(userId, userEmail) === EscrowRole.Payer
  }

  canUserApprove(userId: string, userEmail?: string): boolean {
    return this.getRoleForUser(userId, userEmail) === EscrowRole.Payer
  }

  // ── Financial invariants ──────────────────────────────────────────────────

  isMilestoneType(): boolean {
    return this.type === EscrowType.Milestone
  }

  releasedMilestoneTotal(): number {
    return this.milestones
      .filter((m) => m.status === MilestoneStatus.Released)
      .reduce((sum, m) => sum + Number(m.amount), 0)
  }

  remainingBalance(): number {
    return this.amount - this.releasedMilestoneTotal()
  }

  allMilestonesReleased(): boolean {
    return (
      this.milestones.length > 0 &&
      this.milestones.every((m) => m.status === MilestoneStatus.Released)
    )
  }

  // ── Creation validation ───────────────────────────────────────────────────

  static assertValidCreationInput(input: CreateEscrowInput): void {
    const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR']
    const MAX_ESCROW_AMOUNT = 100_000_000

    if (!SUPPORTED_CURRENCIES.includes(input.currency)) {
      throw new EscrowUnsupportedCurrencyError(
        `Unsupported currency '${input.currency}'. Supported: ${SUPPORTED_CURRENCIES.join(', ')}.`,
      )
    }

    if (input.type === EscrowType.Milestone) {
      const total = input.milestones.reduce((sum, m) => sum + m.amount, 0)
      if (total > MAX_ESCROW_AMOUNT) {
        throw new MilestoneTotalExceedsLimitError(
          `Total milestone amount (${total}) cannot exceed ${MAX_ESCROW_AMOUNT}.`,
        )
      }

      const now = new Date()
      for (const m of input.milestones) {
        if (m.deadline && new Date(m.deadline) <= now) {
          throw new MilestoneDeadlinePastError(
            `Milestone deadline '${m.deadline}' is in the past. Deadlines must be future dates.`,
          )
        }
      }
    }
  }

  // ── Domain event helpers ──────────────────────────────────────────────────

  raiseCreatedEvent(creatorId: string): void {
    this.addDomainEvent(
      new EscrowCreatedEvent(this.id, creatorId, this.type, this.amount, this.currency, this.code),
    )
  }

  fund(payerId: string): void {
    this.assertCanTransitionTo(EscrowStatus.Funded)
    this.addDomainEvent(new EscrowFundedEvent(this.id, payerId, this.amount, this.currency))
  }

  release(releasedByUserId: string): void {
    this.assertCanTransitionTo(EscrowStatus.Released)
    this.addDomainEvent(
      new EscrowReleasedEvent(this.id, releasedByUserId, this.amount, this.currency),
    )
  }
}
