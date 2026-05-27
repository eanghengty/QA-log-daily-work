function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function reportNotesHtmlFromText(text) {
  const lines = String(text || '').replaceAll('\r\n', '\n').split('\n')

  if (lines.length === 0) {
    return '<div><br></div>'
  }

  return lines
    .map((line) => (line ? `<div>${escapeHtml(line)}</div>` : '<div><br></div>'))
    .join('')
}

export function sanitizeReportNotesHtml(html) {
  if (typeof document === 'undefined') {
    return reportNotesHtmlFromText(html)
  }

  const container = document.createElement('div')
  container.innerHTML = String(html || '')

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml(node.textContent || '')
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return ''
    }

    const tagName = node.tagName.toLowerCase()
    const content = Array.from(node.childNodes).map(sanitizeNode).join('')

    if (tagName === 'br') {
      return '<br>'
    }

    if (tagName === 'mark') {
      return `<mark class="report-note-highlight">${content || '<br>'}</mark>`
    }

    if (tagName === 'div' || tagName === 'p') {
      return `<div>${content || '<br>'}</div>`
    }

    return content
  }

  const sanitized = Array.from(container.childNodes).map(sanitizeNode).join('')
  return sanitized || '<div><br></div>'
}

export function reportNotesPlainTextFromHtml(html) {
  if (typeof document === 'undefined') {
    return String(html || '')
  }

  const container = document.createElement('div')
  container.innerHTML = sanitizeReportNotesHtml(html)

  const lines = []

  const collectInlineText = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return ''
    }

    const tagName = node.tagName.toLowerCase()

    if (tagName === 'br') {
      return '\n'
    }

    return Array.from(node.childNodes).map(collectInlineText).join('')
  }

  Array.from(container.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && ['div', 'p'].includes(node.tagName.toLowerCase())) {
      lines.push(collectInlineText(node))
      return
    }

    lines.push(collectInlineText(node))
  })

  return lines.join('\n').replaceAll('\u00a0', ' ')
}
