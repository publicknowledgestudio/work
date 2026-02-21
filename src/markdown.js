/**
 * Simple markdown-to-HTML renderer
 * Supports: headers, bold, italic, lists, inline code, links, paragraphs
 * No external dependencies.
 */

export function renderMarkdown(md) {
  if (!md) return ''

  const lines = md.split('\n')
  let html = ''
  let inUl = false
  let inOl = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // Close lists if needed
    if (inUl && !line.match(/^[\s]*[-*]\s/)) {
      html += '</ul>'
      inUl = false
    }
    if (inOl && !line.match(/^[\s]*\d+\.\s/)) {
      html += '</ol>'
      inOl = false
    }

    // Headers
    if (line.startsWith('### ')) {
      html += `<h3>${inline(line.slice(4))}</h3>`
      continue
    }
    if (line.startsWith('## ')) {
      html += `<h2>${inline(line.slice(3))}</h2>`
      continue
    }
    if (line.startsWith('# ')) {
      html += `<h1>${inline(line.slice(2))}</h1>`
      continue
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      html += '<hr>'
      continue
    }

    // Unordered list
    const ulMatch = line.match(/^[\s]*[-*]\s(.*)/)
    if (ulMatch) {
      if (!inUl) { html += '<ul>'; inUl = true }
      html += `<li>${inline(ulMatch[1])}</li>`
      continue
    }

    // Ordered list
    const olMatch = line.match(/^[\s]*\d+\.\s(.*)/)
    if (olMatch) {
      if (!inOl) { html += '<ol>'; inOl = true }
      html += `<li>${inline(olMatch[1])}</li>`
      continue
    }

    // Empty line = paragraph break
    if (line.trim() === '') {
      html += '<br>'
      continue
    }

    // Regular paragraph
    html += `<p>${inline(line)}</p>`
  }

  // Close any open lists
  if (inUl) html += '</ul>'
  if (inOl) html += '</ol>'

  return html
}

function inline(text) {
  // Escape HTML
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Inline code (before bold/italic to avoid conflicts)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  // Italic
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')

  return text
}
