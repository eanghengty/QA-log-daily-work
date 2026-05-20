export function normalizeSiteScope(scope) {
  return `${scope || ''}`.trim().toLowerCase()
}

export function isMacroSiteScope(scope) {
  return normalizeSiteScope(scope) === 'macro'
}

export function isTxSiteScope(scope) {
  return normalizeSiteScope(scope) === 'tx'
}

export function shouldShowDcplChecklist(scope) {
  const normalizedScope = normalizeSiteScope(scope)
  return normalizedScope !== 'macro' && normalizedScope !== 'tx'
}

export function shouldShowAntennaChecklist(scope) {
  return !isTxSiteScope(scope)
}
