export const RESERVED_SLUGS = ['admin', 'api', 'embed', 'c', 'login', 'auth'] as const

export const STALE_AFTER_MS = 10 * 60 * 1000
export const BLOCKING_AFTER_MS = 24 * 60 * 60 * 1000
export const SYNC_LOCK_MS = 2 * 60 * 1000

export const DEFAULT_SYNC_PAST_DAYS = 90
export const DEFAULT_SYNC_FUTURE_DAYS = 365
export const GOOGLE_MAX_RESULTS = 2500

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
