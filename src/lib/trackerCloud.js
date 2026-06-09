import { db } from '../db/index.js'
import { getStoredCustomSessionToken } from './customAuthSession.js'
import { supabaseAnonKey, supabaseUrl, isSupabaseConfigured } from './supabase.js'

const SETUP_MIRROR_IMPORT_KEY = 'qa_tracker_setup_mirror_imported'

function hasCompletedSetupImport() {
  if (typeof window === 'undefined') return true

  try {
    return window.localStorage.getItem(SETUP_MIRROR_IMPORT_KEY) === '1'
  } catch {
    return true
  }
}

function markSetupImportComplete() {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(SETUP_MIRROR_IMPORT_KEY, '1')
  } catch {
    // If localStorage is unavailable, avoid blocking normal cloud sync.
  }
}

function requireCloudTrackerSession() {
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Supabase tracker sync is not configured.')
    error.code = 'TRACKER_CLOUD_CONFIG_MISSING'
    throw error
  }

  const token = getStoredCustomSessionToken()
  if (!token) {
    const error = new Error('A signed-in tracker session is required.')
    error.code = 'TRACKER_SESSION_REQUIRED'
    throw error
  }

  return token
}

async function callTrackerFunction(functionName, body = {}) {
  const token = requireCloudTrackerSession()

  let response
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
  } catch (cause) {
    const error = new Error(
      `Unable to reach the ${functionName} function. Check that the Edge Function is deployed and the network connection is available.`,
    )
    error.code = 'TRACKER_FUNCTION_UNREACHABLE'
    error.cause = cause
    throw error
  }

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(payload.error || 'Tracker request failed.')
    error.status = response.status
    error.code = payload.code || 'TRACKER_REQUEST_FAILED'
    throw error
  }

  return payload
}

export function isCloudTrackerEnabled() {
  return isSupabaseConfigured
}

export async function listCloudLookups() {
  return await callTrackerFunction('tracker-lookups', { action: 'list' })
}

export async function addCloudScope(name) {
  return await callTrackerFunction('tracker-lookups', {
    action: 'add-scope',
    name,
  })
}

export async function deleteCloudScope(id) {
  return await callTrackerFunction('tracker-lookups', {
    action: 'delete-scope',
    id: id?.id ?? id,
    name: id?.name,
  })
}

export async function addCloudConfirmSource(name) {
  return await callTrackerFunction('tracker-lookups', {
    action: 'add-confirm-source',
    name,
  })
}

export async function deleteCloudConfirmSource(id) {
  return await callTrackerFunction('tracker-lookups', {
    action: 'delete-confirm-source',
    id: id?.id ?? id,
    name: id?.name,
  })
}

export async function importLocalLookupsToCloud({ scopes = [], confirmSources = [] } = {}) {
  return await callTrackerFunction('tracker-lookups', {
    action: 'import-local',
    scopes,
    confirmSources,
  })
}

export async function restoreCloudLookups({ scopes = [], confirmSources = [] } = {}) {
  return await callTrackerFunction('tracker-lookups', {
    action: 'restore-backup',
    scopes,
    confirmSources,
  })
}

export async function listCloudSites() {
  return await callTrackerFunction('tracker-sites', { action: 'list' })
}

export async function getCloudSite(id) {
  return await callTrackerFunction('tracker-sites', {
    action: 'get',
    id,
  })
}

export async function createCloudSite(site) {
  return await callTrackerFunction('tracker-sites', {
    action: 'create',
    site,
  })
}

export async function updateCloudSite(id, updates) {
  return await callTrackerFunction('tracker-sites', {
    action: 'update',
    id,
    updates,
  })
}

export async function upsertCloudSite(site) {
  return await callTrackerFunction('tracker-sites', {
    action: 'upsert',
    site,
  })
}

export async function deleteCloudSite(id) {
  return await callTrackerFunction('tracker-sites', {
    action: 'delete',
    id,
  })
}

export async function importLocalSitesToCloud(sites = []) {
  return await callTrackerFunction('tracker-sites', {
    action: 'import-local',
    sites,
  })
}

export async function restoreCloudSites(sites = []) {
  return await callTrackerFunction('tracker-sites', {
    action: 'restore-backup',
    sites,
  })
}

export async function listCloudCoreSiteData(siteId) {
  return await callTrackerFunction('tracker-core', {
    action: 'list-site',
    siteId,
  })
}

export async function listCloudReports(siteId) {
  return await callTrackerFunction('tracker-core', {
    action: 'list-reports',
    siteId,
  })
}

export async function getCloudReport(id) {
  return await callTrackerFunction('tracker-core', {
    action: 'get-report',
    id,
  })
}

export async function createCloudReport(report) {
  return await callTrackerFunction('tracker-core', {
    action: 'create-report',
    report,
  })
}

export async function updateCloudReport(id, updates) {
  return await callTrackerFunction('tracker-core', {
    action: 'update-report',
    id,
    updates,
  })
}

export async function deleteCloudReport(id) {
  return await callTrackerFunction('tracker-core', {
    action: 'delete-report',
    id,
  })
}

export async function listCloudIssues(siteId) {
  return await callTrackerFunction('tracker-core', {
    action: 'list-issues',
    siteId,
  })
}

export async function getCloudIssue(id) {
  return await callTrackerFunction('tracker-core', {
    action: 'get-issue',
    id,
  })
}

export async function createCloudIssue(issue) {
  return await callTrackerFunction('tracker-core', {
    action: 'create-issue',
    issue,
  })
}

export async function updateCloudIssue(id, updates) {
  return await callTrackerFunction('tracker-core', {
    action: 'update-issue',
    id,
    updates,
  })
}

export async function deleteCloudIssue(id) {
  return await callTrackerFunction('tracker-core', {
    action: 'delete-issue',
    id,
  })
}

export async function listCloudConfirms(siteId) {
  return await callTrackerFunction('tracker-core', {
    action: 'list-confirms',
    siteId,
  })
}

export async function getCloudConfirm(id) {
  return await callTrackerFunction('tracker-core', {
    action: 'get-confirm',
    id,
  })
}

export async function createCloudConfirm(confirm) {
  return await callTrackerFunction('tracker-core', {
    action: 'create-confirm',
    confirm,
  })
}

export async function updateCloudConfirm(id, updates) {
  return await callTrackerFunction('tracker-core', {
    action: 'update-confirm',
    id,
    updates,
  })
}

export async function deleteCloudConfirm(id) {
  return await callTrackerFunction('tracker-core', {
    action: 'delete-confirm',
    id,
  })
}

export async function getCloudSiteBoard(siteId, boardKey) {
  return await callTrackerFunction('tracker-core', {
    action: 'get-site-board',
    siteId,
    boardKey,
  })
}

export async function saveCloudSiteBoard(siteId, boardKey, payload = {}) {
  return await callTrackerFunction('tracker-core', {
    action: 'save-site-board',
    siteId,
    boardKey,
    payload,
  })
}

export async function deleteCloudSiteBoard(siteId, boardKey) {
  return await callTrackerFunction('tracker-core', {
    action: 'delete-site-board',
    siteId,
    boardKey,
  })
}

export async function listCloudDocumentReferences(siteId) {
  return await callTrackerFunction('tracker-core', {
    action: 'list-document-references',
    siteId,
  })
}

export async function addCloudDocumentReference(reference) {
  return await callTrackerFunction('tracker-core', {
    action: 'add-document-reference',
    reference,
  })
}

export async function deleteCloudDocumentReference(id) {
  return await callTrackerFunction('tracker-core', {
    action: 'delete-document-reference',
    id,
  })
}

export async function getCloudEmailSettings(siteId) {
  return await callTrackerFunction('tracker-core', {
    action: 'get-email-settings',
    siteId,
  })
}

export async function saveCloudEmailSettings(settings) {
  return await callTrackerFunction('tracker-core', {
    action: 'save-email-settings',
    settings,
  })
}

export async function getCloudPendingSummary(siteId) {
  return await callTrackerFunction('tracker-core', {
    action: 'get-pending-summary',
    siteId,
  })
}

export async function saveCloudPendingSummary(pendingSummary) {
  return await callTrackerFunction('tracker-core', {
    action: 'save-pending-summary',
    pendingSummary,
  })
}

export async function deleteCloudPendingSummary(siteId) {
  return await callTrackerFunction('tracker-core', {
    action: 'delete-pending-summary',
    siteId,
  })
}

export async function getCloudSnagSummary(siteId) {
  return await callTrackerFunction('tracker-core', {
    action: 'get-snag-summary',
    siteId,
  })
}

export async function saveCloudSnagSummary(snagSummary) {
  return await callTrackerFunction('tracker-core', {
    action: 'save-snag-summary',
    snagSummary,
  })
}

export async function deleteCloudSnagSummary(siteId) {
  return await callTrackerFunction('tracker-core', {
    action: 'delete-snag-summary',
    siteId,
  })
}

export async function listCloudSnagReports(siteId) {
  return await callTrackerFunction('tracker-core', {
    action: 'list-snag-reports',
    siteId,
  })
}

export async function createCloudSnagReport(snagReport) {
  return await callTrackerFunction('tracker-core', {
    action: 'create-snag-report',
    snagReport,
  })
}

export async function updateCloudSnagReport(id, updates) {
  return await callTrackerFunction('tracker-core', {
    action: 'update-snag-report',
    id,
    updates,
  })
}

export async function deleteCloudSnagReport(id) {
  return await callTrackerFunction('tracker-core', {
    action: 'delete-snag-report',
    id,
  })
}

export async function uploadCloudAttachment(attachment) {
  return await callTrackerFunction('tracker-attachments', {
    action: 'upload',
    attachment,
  })
}

export async function getCloudAttachment(id) {
  return await callTrackerFunction('tracker-attachments', {
    action: 'get',
    id,
  })
}

export async function importCloudSiteCoreData({
  siteId,
  reports = [],
  issues = [],
  confirms = [],
  documentReferences = [],
  emailSettings = null,
  pendingSummary = null,
  boards = {},
} = {}) {
  return await callTrackerFunction('tracker-core', {
    action: 'import-site-core',
    siteId,
    reports,
    issues,
    confirms,
    documentReferences,
    emailSettings,
    pendingSummary,
    boards,
  })
}

export async function syncTrackerSetupMirror() {
  if (!isCloudTrackerEnabled()) {
    return {
      scopes: [],
      confirmSources: [],
      sites: [],
    }
  }

  const [{ scopes: cloudScopes, confirmSources: cloudConfirmSources }, { sites: cloudSites }] = await Promise.all([
    listCloudLookups(),
    listCloudSites(),
  ])

  const hasCloudSetupData = Boolean(cloudScopes?.length || cloudConfirmSources?.length || cloudSites?.length)
  const [localScopes, localConfirmSources, localSites] = await Promise.all([
    db.scopes.toArray(),
    db.confirmSources.toArray(),
    db.sites.toArray(),
  ])
  const hasLocalSetupData = Boolean(localScopes.length || localConfirmSources.length || localSites.length)

  let scopes = cloudScopes || []
  let confirmSources = cloudConfirmSources || []
  let sites = cloudSites || []

  if (!hasCompletedSetupImport() && !hasCloudSetupData && hasLocalSetupData) {
    await Promise.all([
      importLocalLookupsToCloud({
        scopes: localScopes,
        confirmSources: localConfirmSources,
      }),
      importLocalSitesToCloud(localSites),
    ])

    const [{ scopes: importedScopes, confirmSources: importedConfirmSources }, { sites: importedSites }] =
      await Promise.all([
        listCloudLookups(),
        listCloudSites(),
      ])

    scopes = importedScopes || []
    confirmSources = importedConfirmSources || []
    sites = importedSites || []
  }

  markSetupImportComplete()

  await db.transaction('rw', db.scopes, db.confirmSources, db.sites, async () => {
    await db.scopes.clear()
    await db.confirmSources.clear()
    await db.sites.clear()

    if (scopes?.length) {
      await db.scopes.bulkPut(scopes)
    }

    if (confirmSources?.length) {
      await db.confirmSources.bulkPut(confirmSources)
    }

    if (sites?.length) {
      await db.sites.bulkPut(sites)
    }
  })

  return {
    scopes: scopes || [],
    confirmSources: confirmSources || [],
    sites: sites || [],
  }
}

export async function refreshTrackerSetupMirror() {
  if (!isCloudTrackerEnabled()) {
    return {
      scopes: [],
      confirmSources: [],
      sites: [],
    }
  }

  const [{ scopes, confirmSources }, { sites }] = await Promise.all([
    listCloudLookups(),
    listCloudSites(),
  ])

  await db.transaction('rw', db.scopes, db.confirmSources, db.sites, async () => {
    await db.scopes.clear()
    await db.confirmSources.clear()
    await db.sites.clear()

    if (scopes?.length) {
      await db.scopes.bulkPut(scopes)
    }

    if (confirmSources?.length) {
      await db.confirmSources.bulkPut(confirmSources)
    }

    if (sites?.length) {
      await db.sites.bulkPut(sites)
    }
  })

  return {
    scopes: scopes || [],
    confirmSources: confirmSources || [],
    sites: sites || [],
  }
}
