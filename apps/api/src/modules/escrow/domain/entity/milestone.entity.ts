import type { Milestone } from '@prisma/client'
import { Entity } from '../../../../shared/base/Entity'
import { MilestoneStatus } from '../../escrow.types'

export class MilestoneEntity extends Entity<string> {
  private constructor(private readonly props: Milestone) {
    super(props.id)
  }

  static from(data: Milestone): MilestoneEntity {
    return new MilestoneEntity(data)
  }

  get escrowId(): string {
    return this.props.escrowId
  }
  get title(): string {
    return this.props.title
  }
  get description(): string | null {
    return this.props.description
  }
  get amount(): number {
    return Number(this.props.amount)
  }
  get currency(): string {
    return 'NGN'
  } // currency lives on the parent Escrow
  get status(): MilestoneStatus {
    return this.props.status as MilestoneStatus
  }
  get order(): number {
    return this.props.order
  }
  get deadline(): Date | null {
    return this.props.deadline
  }

  isDeadlineBreached(): boolean {
    if (!this.deadline) return false
    return new Date() > this.deadline && this.status !== MilestoneStatus.Released
  }

  canBeSubmitted(): boolean {
    return [MilestoneStatus.Pending, MilestoneStatus.InProgress].includes(this.status)
  }

  canBeApproved(): boolean {
    return this.status === MilestoneStatus.Submitted
  }

  canBeReleased(): boolean {
    return this.status === MilestoneStatus.Approved
  }
}
