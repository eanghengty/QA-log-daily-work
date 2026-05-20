export function getHopReviewerName(site) {
  const value = `${site?.hopReviewer || ''}`.trim()
  return value || 'NA'
}

export function formatSiteNameWithHopReviewer(site, fallback = 'Site') {
  const siteName = `${site?.name || fallback}`.trim() || fallback
  return `${siteName} - HOP reviewer: ${getHopReviewerName(site)}`
}
