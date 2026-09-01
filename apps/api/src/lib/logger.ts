import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'
const level = process.env.LOG_LEVEL ?? 'info'

export const logger = pino({
  level,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,module',
        messageFormat: '{module} | {msg}',
      },
    },
  }),
  ...(!isDev && {
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
})

export const log = {
  config: logger.child({ module: 'config' }),
  db:     logger.child({ module: 'db' }),
  events: logger.child({ module: 'events' }),
  auth:   logger.child({ module: 'auth' }),
  worker: {
    notifications: logger.child({ module: 'worker:notifications' }),
    escrow:        logger.child({ module: 'worker:escrow' }),
    auth:          logger.child({ module: 'worker:auth' }),
  },
}
