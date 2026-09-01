import type { Escrow, Milestone, EscrowParticipant } from '@prisma/client'
import { AggregateRoot } from '../../../../shared/base/AggregateRoot'
import { EscrowStatus, EscrowType, EscrowRole, MilestoneStatus, canTransition } from '../../escrow.types'
import { EscrowCreatedEvent } from '../events/escrow-created.event'
import { EscrowFundedEvent }  from '../events/escrow-funded.event'
import { EscrowReleasedEvent } from '../events/escrow-released.event'

// The shape of data the aggregate needs — Prisma row plus optional relations.
// Relations are optional because we don't always join them (e.g. getById vs getByCode).
type EscrowData = Escrow & {
  milestones?:    Milestone[]
  participants?:  EscrowParticipant[]
}

// ─────────────────────────────────────────────────────────────────────────────
// EscrowAggregate
//
// This is the Aggregate Root for the escrow cluster.
// "Aggregate Root" means: the only object external code (services) directly
// touches to run business logic. Milestones and Participants are always accessed
// through EscrowAggregate, never fetched and manipulated independently.
//
// What it owns:
//   • The state machine   — canTransitionTo / assertCanTransitionTo
//   • Permission checks   — canUserFund, canUserApprove, getRoleForUser
//   • Financial invariants — remainingBalance, allMilestonesReleased
//   • Domain events        — each command method adds an event to the internal list;
//                            the service dispatches them after the DB write succeeds
//
// What it does NOT own:
//   • Persistence         — Prisma, not the aggregate, writes to the DB
//   • HTTP concerns       — no Fastify types here
//   • Validation of input fields — Zod schemas handle that at the API boundary
// ─────────────────────────────────────────────────────────────────────────────
export class EscrowAggregate extends AggregateRoot<string> {
  private readonly milestones:   Milestone[]
  private readonly participants: EscrowParticipant[]

  private constructor(private readonly props: Escrow, data: EscrowData) {
    super(props.id)
    this.milestones   = data.milestones   ?? []
    this.participants = data.participants ?? []
  }

  // ── Factories ────────────────────────────────────────────────────────────
  //
  // We have one static factory: from().
  // It is used for BOTH newly persisted records and records loaded from DB.
  // The distinction (new vs existing) is made by the method the SERVICE calls
  // afterwards: raiseCreatedEvent() for new records, nothing extra for existing.

  static from(data: EscrowData): EscrowAggregate {
    return new EscrowAggregate(data, data)
  }

  // ── Getters ──────────────────────────────────────────────────────────────
  //
  // Getters expose properties without leaking the raw Prisma type.
  // We cast enums here (from string to EscrowType/EscrowStatus) so callers
  // always work with type-safe values.

  get code(): string              { return this.props.code }
  get title(): string             { return this.props.title }
  get type(): EscrowType          { return this.props.type as EscrowType }
  get status(): EscrowStatus      { return this.props.status as EscrowStatus }
  get amount(): number            { return Number(this.props.amount) }
  get currency(): string          { return this.props.currency }
  get creatorId(): string         { return this.props.creatorId }
  get releaseCondition(): string | null { return this.props.releaseCondition }

  // ── State machine ────────────────────────────────────────────────────────

  canTransitionTo(next: EscrowStatus): boolean {
    return canTransition(this.status, next)
  }

  // assertCanTransitionTo throws instead of returning false.
  // Services call this before touching the DB — if the transition is invalid,
  // we fail fast with a clear domain error before any write happens.
  // Compare to the old pattern: "if (!canTransition(...)) throw error" scattered
  // across services. Now it's one canonical place.
  assertCanTransitionTo(next: EscrowStatus): void {
    if (!this.canTransitionTo(next)) {
      throw new Error(
        `Escrow "${this.code}" cannot move from '${this.status}' to '${next}'. ` +
        `Valid next states: [${Object.entries({
          Created:        'AwaitingPayment, Cancelled',
          AwaitingPayment:'Funded, Cancelled',
          Funded:         'Held, Refunded',
          Held:           'AwaitingAction, Released, Refunded, Disputed',
          AwaitingAction: 'Released, Refunded, Disputed',
          Disputed:       'Released, Refunded',
        })[this.status] ?? 'none — this is a terminal state'}]`,
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

  // Called by the service immediately after a new escrow is persisted in the DB.
  raiseCreatedEvent(creatorId: string): void {
    this.addDomainEvent(
      new EscrowCreatedEvent(
        this.id,
        creatorId,
        this.type,
        this.amount,
        this.currency,
        this.code,
      ),
    )
  }

  fund(payerId: string): void {
    this.assertCanTransitionTo(EscrowStatus.Funded)
    this.addDomainEvent(
      new EscrowFundedEvent(this.id, payerId, this.amount, this.currency),
    )
  }

  release(releasedByUserId: string): void {
    this.assertCanTransitionTo(EscrowStatus.Released)
    this.addDomainEvent(
      new EscrowReleasedEvent(this.id, releasedByUserId, this.amount, this.currency),
    )
  }
}
