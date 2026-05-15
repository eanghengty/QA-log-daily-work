import { db } from '../db/index.js'

export async function buildEmailBody(report, site, settings = {}) {
  const { includeIssues = true, includeConfirms = true } = settings

  const issues = includeIssues
    ? (await db.issues.bulkGet(report.linkedIssueIds || [])).filter(Boolean)
    : []
  const confirms = includeConfirms
    ? (await db.confirms.bulkGet(report.linkedConfirmIds || [])).filter(Boolean)
    : []

  const noteLines = (report.notes || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const noteItems = noteLines.length
    ? noteLines.map((l) => `  <li>${escapeHtml(l)}</li>`).join('\n')
    : `  <li>Site progress notes captured</li>`
  let html = `<p style="margin:14px 0 4px; font-weight:600; color:#1a1a1a;">Progress summary</p>
<ul style="margin:4px 0 0 18px; padding:0;">
${noteItems}
</ul>`

  if (includeIssues && issues.length > 0) {
    html += `<p style="margin:14px 0 4px; font-weight:600; color:#c2701c;">Open blockers (${issues.length})</p>
<ul style="margin:4px 0 0 18px; padding:0;">`
    issues.forEach((issue) => {
      html += `<li><strong>${escapeHtml(issue.code)}</strong> - ${escapeHtml(issue.title)} <em>(${escapeHtml(issue.priority)})</em></li>`
    })
    html += '</ul>'
  }

  if (includeConfirms && confirms.length > 0) {
    html += `<p style="margin:14px 0 4px; font-weight:600; color:#4f7a4a;">Confirmations (${confirms.length})</p>
<ul style="margin:4px 0 0 18px; padding:0;">`
    confirms.forEach((confirm) => {
      html += `<li><strong>${escapeHtml(confirm.code)}</strong> - ${escapeHtml(confirm.title)}</li>`
    })
    html += '</ul>'
  }

  return html
}

export async function generateEml(emailData) {
  const { to, cc, from, subject, htmlBody, attachments = [] } = emailData

  const boundary = `----${Date.now()}=${Math.random()}`
  let eml = `From: ${from}
To: ${to}
Cc: ${cc || ''}
Subject: ${subject}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${boundary}"
X-Unsent: 1

`

  eml += `--${boundary}
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: 8bit

${htmlBody}

`

  for (const attachment of attachments) {
    const blob = attachment.blob
    const base64 = await blobToBase64(blob)
    const base64Data = base64.split(',')[1]

    eml += `--${boundary}
Content-Type: ${blob.type || 'application/octet-stream'}; name="${attachment.name}"
Content-Disposition: attachment; filename="${attachment.name}"
Content-Transfer-Encoding: base64

${base64Data}

`
  }

  eml += `--${boundary}--`

  return new Blob([eml], { type: 'message/rfc822' })
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function downloadEml(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function copyToClipboard(text) {
  return navigator.clipboard.writeText(text)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
