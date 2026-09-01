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
  get creatorId(): string {
    return this.props.creatorId
  }
  get releaseCondition(): string | null {
    return this.props.releaseCondition
  }

  // ── State machine ────────────────────────────────────────────────────────

  canTransitionTo(next: EscrowStatus): boolean {
    return canTransition(this.status, next)
  }

  assertCanTransitionTo(next: EscrowStatus): void {
    if (!this.canTransitionTo(next)) {
      throw new Error(
        `Escrow "${this.code}" cannot move from '${this.status}' to '${next}'. ` +
          `Valid next states: [${
            Object.entries({
              Created: 'AwaitingPayment, Cancelled',
              AwaitingPayment: 'Funded, Cancelled',
              Funded: 'Held, Refunded',
              Held: 'AwaitingAction, Released, Refunded, Disputed',
              AwaitingAction: 'Released, Refunded, Disputed',
              Disputed: 'Released, Refunded',
            })[this.status] ?? 'none — this is a terminal state'
          }]`,
      )
    }
  }

  // ── Role-based access ────────────────────────────────────────────────────

  getRoleForUser(userId: string): EscrowRole | null {
    const participant = this.participants.find((p) => p.userId === userId)
    return participant ? (participant.role as EscrowRole) : null
  }

  isCreatedBy(userId: string): boolean {
    return this.props.creatorId === userId
  }

  isParticipant(userId: string): boolean {
    return this.participants.some((p) => p.userId === userId)
  }

  canUserFund(userId: string): boolean {
    const role = this.getRoleForUser(userId)
    return role === EscrowRole.Buyer || role === EscrowRole.Creator
  }

  canUserApprove(userId: string): boolean {
    const role = this.getRoleForUser(userId)
    return role === EscrowRole.Buyer || role === EscrowRole.Creator
  }

  // ── Financial invariants ─────────────────────────────────────────────────

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

  // ── Commands (business operations) ──────────────────────────────────────
  //
  // Each command:
  //   1. Validates the operation is currently allowed (throws if not)
  //   2. Adds the corresponding domain event via addDomainEvent()
  //
  // The service then persists the state change to the DB and dispatches
  // the events via eventDispatcher.dispatchMany(aggregate.domainEvents).
  //
  // Notice addDomainEvent() is protected on AggregateRoot — only this class
  // and its subclasses can call it. External code cannot add arbitrary events.

  // ── Creation invariant validation ────────────────────────────────────────
  //
  // Called by EscrowService.create() BEFORE any DB write.
  //
  // Why here and not only in Zod?
  // Zod validates SHAPE: "is amount a positive number?" — a format question.
  // The aggregate validates MEANING: "does this amount make business sense
  // for this escrow type?" — a domain question.
  //
  // These two layers are complementary, not redundant.
  //   Zod catches malformed HTTP payloads at the API boundary.
  //   The aggregate enforces invariants that only the domain understands.

  static assertValidCreationInput(input: CreateEscrowInput): void {
    const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR']

    if (!SUPPORTED_CURRENCIES.includes(input.currency)) {
      throw new Error(
        `Unsupported currency '${input.currency}'. Supported: ${SUPPORTED_CURRENCIES.join(', ')}.`,
      )
    }

    if (input.type === EscrowType.Milestone) {
      const now = new Date()
      for (const m of input.milestones) {
        if (m.deadline && new Date(m.deadline) <= now) {
          throw new Error(
            `Milestone deadline '${m.deadline}' is in the past. Deadlines must be future dates.`,
          )
        }
      }
    }
  }

  // Called by the service immediately after a new escrow is persisted in the DB.
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
