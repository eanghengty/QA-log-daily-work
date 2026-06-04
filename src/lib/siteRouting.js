const SITE_ID_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/

export function getSiteIdError(value) {
  const siteId = String(value ?? '').trim()

  if (!siteId) return 'Site ID is required.'
  if (!SITE_ID_PATTERN.test(siteId)) {
    return 'Use only letters, numbers, and hyphens for Site ID, for example tower-01.'
  }

  return ''
}

export function assertValidSiteId(value) {
  const message = getSiteIdError(value)

  if (!message) return

  const error = new Error(message)
  error.code = 'INVALID_SITE_ID'
  throw error
}

export function buildSitePath(siteId, suffix = '') {
  const encodedSiteId = encodeURIComponent(String(siteId ?? '').trim())
  const normalizedSuffix = suffix
    ? (suffix.startsWith('/') ? suffix : `/${suffix}`)
    : ''

  return `/site/${encodedSiteId}${normalizedSuffix}`
}

export function toSiteFileSlug(value) {
  return (
    String(value ?? '')
      .trim()
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'site'
  )
}
