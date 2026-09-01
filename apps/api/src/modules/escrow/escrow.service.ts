import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { customAlphabet } from 'nanoid'
import { EscrowStatus, EscrowRole, EscrowType } from './escrow.types'
import type { CreateEscrowInput } from './escrow.schema'
import { EscrowAggregate } from './domain/entity/escrow.aggregate'
import { eventDispatcher } from '../../lib/event-dispatcher'

const generateCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6)

export class EscrowService {
  constructor(
    private readonly db: PrismaClient,
    private readonly app: FastifyInstance,
  ) {}

  // ── create ────────────────────────────────────────────────────────────────
  //
  // Pattern: persist first, then wrap in aggregate, then raise events.
  //
  // WHY persist first?
  //   In pure DDD you build the aggregate in memory, then save it. In Partial DDD
  //   with Prisma as the ORM we let Prisma handle ID generation and nested creates
  //   (participants, milestones). We then wrap the persisted data in an aggregate
  //   purely for event-raising — the aggregate's state machine isn't needed here
  //   because we're creating, not transitioning.
  async create(creatorId: string, input: CreateEscrowInput) {
    const code = generateCode()

    // For Milestone escrows the total is the sum of milestone amounts.
    const amount =
      input.type === EscrowType.Milestone
        ? input.milestones.reduce((sum, m) => sum + m.amount, 0)
        : input.amount

    // ── 1. Persist via Prisma ────────────────────────────────────────────
    const escrowData = await this.db.escrow.create({
      data: {
        code,
        title:       input.title,
        description: input.description,
        type:        input.type,
        status:      EscrowStatus.Created,
        amount,
        currency:    input.currency,
        releaseCondition:
          input.type === EscrowType.Conditional ? input.releaseCondition : null,
        creatorId,
        participants: {
          create: { userId: creatorId, role: EscrowRole.Creator },
        },
        ...(input.type === EscrowType.Milestone && {
          milestones: {
            create: input.milestones.map((m, i) => ({
              title:       m.title,
              description: m.description,
              amount:      m.amount,
              deadline:    m.deadline ? new Date(m.deadline) : null,
              order:       i + 1,
            })),
          },
        }),
        events: {
          create: { type: 'EscrowCreated', actor: creatorId },
        },
      },
      include: { milestones: true, participants: true },
    })

    // ── 2. Wrap in aggregate ─────────────────────────────────────────────
    //
    // EscrowAggregate.from() is a lightweight constructor — it just wraps
    // the data object. No extra queries. The aggregate now exposes all
    // business methods on this escrow.
    const escrow = EscrowAggregate.from(escrowData)

    // ── 3. Raise the creation domain event ───────────────────────────────
    //
    // raiseCreatedEvent() calls addDomainEvent() internally on the AggregateRoot.
    // The event is queued inside the aggregate — not sent yet.
    // This is intentional: if the code below crashes, no event fires for a failed op.
    escrow.raiseCreatedEvent(creatorId)

    // ── 4. Dispatch collected events ─────────────────────────────────────
    //
    // eventDispatcher.dispatchMany() sends every event the aggregate collected
    // to the outside world (currently logs, later → BullMQ).
    // clearDomainEvents() empties the list so the aggregate can be reused safely.
    await eventDispatcher.dispatchMany(escrow.domainEvents)
    escrow.clearDomainEvents()

    return escrowData
  }

  // ── transition ────────────────────────────────────────────────────────────
  //
  // This method shows the most complete use of the domain aggregate.
  // Every step is numbered and explained — study this pattern.
  async transition(escrowId: string, actorId: string, toStatus: EscrowStatus) {
    // ── 1. Load from DB ──────────────────────────────────────────────────
    //
    // We need participants to check roles in step 4, so we include them.
    const data = await this.db.escrow.findUnique({
      where: { id: escrowId },
      include: { participants: true },
    })
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    // ── 2. Wrap in aggregate ─────────────────────────────────────────────
    //
    // From this point on, all business logic runs through the aggregate.
    // The raw `data` object is not touched again.
    const escrow = EscrowAggregate.from(data)

    // ── 3. Validate the state transition ─────────────────────────────────
    //
    // assertCanTransitionTo() checks the VALID_TRANSITIONS table and throws
    // a descriptive domain error if the move is illegal.
    // This error is caught by Fastify's error handler and returned as 400.
    try {
      escrow.assertCanTransitionTo(toStatus)
    } catch (err) {
      throw this.app.httpErrors.badRequest((err as Error).message)
    }

    // ── 4. Authorisation check via aggregate ─────────────────────────────
    //
    // The aggregate knows the participants — it answers permission questions.
    // We don't query participants again; they were loaded in step 1.
    if (!escrow.isParticipant(actorId)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }

    // ── 5. Execute the business command ──────────────────────────────────
    //
    // Each command method:
    //   a) Re-validates the specific transition (defensive, belt-and-suspenders)
    //   b) Calls addDomainEvent() to queue the corresponding domain event
    //
    // We do NOT persist here yet. Events should only fire after the DB write
    // succeeds — so we collect first, persist next, dispatch last.
    switch (toStatus) {
      case EscrowStatus.Funded:
        escrow.fund(actorId)
        break
      case EscrowStatus.Released:
        escrow.release(actorId)
        break
      // Other transitions (Held, Disputed, Refunded, etc.) will get their own
      // command methods on the aggregate as we implement them.
    }

    // ── 6. Persist the state change ──────────────────────────────────────
    //
    // Prisma writes the new status. We also write an EscrowEvent row —
    // this is the audit trail / timeline visible on the dashboard.
    const updated = await this.db.escrow.update({
      where: { id: escrowId },
      data: {
        status:     toStatus,
        fundedAt:   toStatus === EscrowStatus.Funded   ? new Date() : undefined,
        releasedAt: toStatus === EscrowStatus.Released ? new Date() : undefined,
        events: {
          create: { type: `StatusChangedTo${toStatus}`, actor: actorId },
        },
      },
    })

    // ── 7. Dispatch domain events ─────────────────────────────────────────
    //
    // Only now — after the DB write committed — do we dispatch events.
    // If step 6 threw, we never reach here, so no false notifications.
    await eventDispatcher.dispatchMany(escrow.domainEvents)
    escrow.clearDomainEvents()

    return updated
  }

  // ── Queries ───────────────────────────────────────────────────────────────
  //
  // These are read-only. They return Prisma data directly — no aggregate needed
  // because no business rules are enforced for reads.

  async getByCode(code: string) {
    const escrow = await this.db.escrow.findUnique({
      where: { code },
      include: {
        creator:      { select: { id: true, firstName: true, lastName: true, email: true } },
        participants: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        milestones:   { orderBy: { order: 'asc' } },
        events:       { orderBy: { createdAt: 'desc' }, take: 20 },
        disputes:     true,
      },
    })
    if (!escrow) throw this.app.httpErrors.notFound('Escrow not found')
    return escrow
  }

  async listByUser(userId: string) {
    return this.db.escrow.findMany({
      where: {
        OR: [
          { creatorId: userId },
          { participants: { some: { userId } } },
        ],
      },
      include: { milestones: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    })
  }
}
