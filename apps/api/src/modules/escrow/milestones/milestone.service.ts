import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { MilestoneStatus } from '../escrow.types'

export class MilestoneService {
  constructor(
    private readonly db: PrismaClient,
    private readonly app: FastifyInstance,
  ) {}

  async submit(milestoneId: string, actorId: string) {
    const milestone = await this.db.milestone.findUniqueOrThrow({ where: { id: milestoneId } })

    const submittableStates = [MilestoneStatus.Pending, MilestoneStatus.InProgress]
    if (!submittableStates.includes(milestone.status as MilestoneStatus)) {
      throw this.app.httpErrors.badRequest('Milestone cannot be submitted from its current state')
    }

    return this.db.milestone.update({
      where: { id: milestoneId },
      data: { status: MilestoneStatus.Submitted, submittedAt: new Date() },
    })
  }

  async approve(milestoneId: string, actorId: string) {
    const milestone = await this.db.milestone.findUniqueOrThrow({ where: { id: milestoneId } })

    if (milestone.status !== MilestoneStatus.Submitted) {
      throw this.app.httpErrors.badRequest('Only submitted milestones can be approved')
    }

    const approved = await this.db.milestone.update({
      where: { id: milestoneId },
      data: { status: MilestoneStatus.Approved, approvedAt: new Date() },
    })

    // TODO: trigger fund release for this milestone and record the EscrowTransaction

    return approved
  }
}
