export function parsePendingSummaryInput(value) {
  const text = String(value || '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const sections = []
  let currentSection = null
  let currentGroup = null

  for (const rawLine of lines) {
    const line = String(rawLine || '').replace(/\t/g, '  ').trim()
    if (!line) continue

    const subgroupMatch = line.match(/^(\d+(?:\.\d+)+)\.?\s*(.+)$/)
    if (subgroupMatch?.[2]) {
      currentSection = currentSection || ensureSection(sections, 'General', '')
      currentGroup = ensureGroup(currentSection, subgroupMatch[2], subgroupMatch[1])
      continue
    }

    const mainMatch = line.match(/^(\d+)[.)]?\s*(.+)$/)
    if (mainMatch?.[2]) {
      currentSection = ensureSection(sections, mainMatch[2], mainMatch[1])
      currentGroup = null
      continue
    }

    const bulletMatch = line.match(/^[-*•]\s*(.+)$/)
    const itemTitle = cleanTitle(bulletMatch?.[1] || line)
    if (!itemTitle) continue

    currentSection = currentSection || ensureSection(sections, 'General', '')
    currentGroup = currentGroup || ensureGroup(currentSection, 'General', '')
    ensureItem(currentGroup, itemTitle)
  }

  return {
    sections: sections
      .map((section, sectionIndex) => ({
        ...section,
        order: sectionIndex + 1,
        groups: (section.groups || [])
          .filter((group) => group.items?.length)
          .map((group, groupIndex) => ({
            ...group,
            order: groupIndex + 1,
            items: (group.items || []).map((item, itemIndex) => ({
              ...item,
              order: itemIndex + 1,
            })),
          })),
      }))
      .filter((section) => section.groups.length),
  }
}

function ensureSection(sections, title, code) {
  const clean = cleanTitle(title)
  const key = normalizeKey(clean)
  let section = sections.find((item) => normalizeKey(item.title) === key)

  if (!section) {
    section = {
      id: createLocalId('pending-section'),
      code: String(code || '').trim(),
      title: clean,
      order: sections.length + 1,
      groups: [],
    }
    sections.push(section)
  } else if (code && !section.code) {
    section.code = String(code).trim()
  }

  return section
}

function ensureGroup(section, title, code) {
  const clean = cleanTitle(title)
  const key = normalizeKey(clean)
  let group = (section.groups || []).find((item) => normalizeKey(item.title) === key)

  if (!group) {
    group = {
      id: createLocalId('pending-group'),
      code: String(code || '').trim(),
      title: clean,
      order: (section.groups || []).length + 1,
      items: [],
    }
    section.groups.push(group)
  } else if (code && !group.code) {
    group.code = String(code).trim()
  }

  return group
}

function ensureItem(group, title) {
  const clean = cleanTitle(title)
  const key = normalizeKey(clean)
  const existing = (group.items || []).find((item) => normalizeKey(item.title) === key)
  if (existing) return existing

  const item = {
    id: createLocalId('pending-item'),
    title: clean,
    status: 'todo',
    actionHistory: [],
  }
  group.items.push(item)
  return item
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeKey(value) {
  return cleanTitle(value).toLowerCase()
}

function createLocalId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}
