// Shared types and utilities used across apps
// Add types here that both the API and Web need to agree on

export type ApiResponse<T> = {
  data: T
  message?: string
}

export type PaginatedResponse<T> = {
  data: T[]
  total: number
  page: number
  pageSize: number
}
