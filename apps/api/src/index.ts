import 'dotenv/config'
import { buildApp } from './app'
import { env } from './config'
import { createQueues } from './queues'
import { startNotificationsWorker } from './queues/workers/notifications.worker'
import { startEscrowWorker } from './queues/workers/escrow.worker'
import { startAuthWorker } from './queues/workers/auth.worker'

const start = async () => {
  const app = await buildApp()

  // Start BullMQ queues and workers
  createQueues(app.redis)
  startNotificationsWorker(app.redis)
  startEscrowWorker(app.redis)
  startAuthWorker(app.redis)

  try {
    await app.listen({ port: Number(env.PORT), host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
