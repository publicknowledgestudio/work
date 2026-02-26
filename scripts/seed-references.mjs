#!/usr/bin/env node
/**
 * One-off script to seed the references collection from #references Slack history.
 *
 * Usage:
 *   API_KEY=<your-key> node scripts/seed-references.mjs [--dry-run] [--skip-preview]
 *
 * Flags:
 *   --dry-run       Print what would be created without writing to Firestore
 *   --skip-preview  Skip calling previewReference (faster, no metadata enrichment)
 */

const API_BASE = 'https://us-central1-workdotpk-a06dc.cloudfunctions.net/api'
const API_KEY = process.env.API_KEY
const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_PREVIEW = process.argv.includes('--skip-preview')
const SLACK_CHANNEL = 'C08UCQXH7D0'

if (!API_KEY) {
  console.error('Missing API_KEY env var. Run: firebase functions:secrets:access CLAUDE_API_KEY')
  process.exit(1)
}

// Slack user ID -> display name
const USERS = {
  'U08TSUSEPMJ': 'Charu',
  'U08TAJW39NK': 'Gyan',
  'U09AT94T0PQ': 'Anandu',
  'U09AT93RXGW': 'Sharang',
}

// Extracted from #references channel history (Feb 2026 → Nov 2025)
// Format: [url, sharedBy (Slack user ID), slackMessageTs, contextText]
const RAW_ENTRIES = [
  ['https://www.swishy.ai/', 'U08TSUSEPMJ', '1771903176.450659', ''],
  ['https://www.amperoshealth.com', 'U08TSUSEPMJ', '1771855010.713389', ''],
  ['https://x.com/editwhiz_editor/status/2024484636815188328', 'U08TSUSEPMJ', '1771607038.391319', ''],
  ['https://sundial.ai/', 'U08TAJW39NK', '1771529906.430559', ''],
  ['https://erichu.info', 'U09AT94T0PQ', '1771515542.752279', ''],
  ['https://pro.tailark.com/expandable-features', 'U09AT94T0PQ', '1771327752.191559', ''],
  ['https://www.navbar.gallery/mobile-navigation', 'U08TSUSEPMJ', '1771231952.531429', ''],
  ['https://x.com/0xcharlota/status/2021997516523233604', 'U08TSUSEPMJ', '1770958085.734899', ''],
  ['https://altermag.com/articles/kanchipuram-saris-and-thinking-machines', 'U08TAJW39NK', '1770909670.352139', ''],
  ['https://x.com/thelifeofrishi/status/2021590988016230516', 'U08TSUSEPMJ', '1770831124.603379', ''],
  ['https://www.designspells.com/', 'U08TSUSEPMJ', '1770481628.908129', ''],
  ['https://www.figma.com/community/file/1599596331443906590/waybill-brand-guidelines-template', 'U08TSUSEPMJ', '1770302051.732189', 'Brand guidelines template'],
  ['https://www.chatcut.io/', 'U08TSUSEPMJ', '1770224573.251579', ''],
  ['https://extraset.ch/typefaces/es-park/', 'U08TSUSEPMJ', '1770223210.823039', ''],
  ['https://abcdinamo.com/news/silvio-lorusso-serif-populism-guest-essay', 'U08TSUSEPMJ', '1770092858.180249', 'Serif populism'],
  ['https://x.com/ayushsoni_io/status/2017942713283547282', 'U08TSUSEPMJ', '1770092774.052659', ''],
  ['https://raggededge.com', 'U09AT94T0PQ', '1770052256.967639', ''],
  ['https://dbco.online/', 'U09AT94T0PQ', '1769751798.436609', ''],
  ['https://x.com/TweetsByTBI/status/2016542033956274591', 'U08TSUSEPMJ', '1769707084.639129', ''],
  ['https://x.com/guidorosso/status/2015516927704379811', 'U08TAJW39NK', '1769415755.834549', 'Rive possibilities'],
  ['https://www.threads.com/@hasque/post/DT0qdgGgdLM', 'U08TSUSEPMJ', '1769151746.139779', ''],
  ['https://scroll.locomotive.ca/', 'U08TAJW39NK', '1769067257.396879', ''],
  ['https://www.youtube.com/@sneakpeekdesign', 'U08TAJW39NK', '1768934927.338369', 'Interesting channel'],
  ['https://x.com/oratorydesign/status/1932873143569248562', 'U08TAJW39NK', '1768851234.114479', ''],
  ['https://logosystem.co/', 'U08TSUSEPMJ', '1768506196.502729', ''],
  ['https://www.designment.co/intro', 'U08TSUSEPMJ', '1768414448.369779', ''],
  ['https://design.google/library/gemini-ai-visual-design', 'U08TSUSEPMJ', '1768365327.827779', ''],
  ['https://x.com/GoogleDesign/status/2010806460645851304', 'U08TSUSEPMJ', '1768365298.764809', ''],
  ['https://x.com/Faris_rzk/status/2010294358315303100', 'U08TSUSEPMJ', '1768209691.986849', ''],
  ['https://fourthfloor.design/', 'U08TSUSEPMJ', '1767976400.829499', ''],
  ['https://www.makingsoftware.com/chapters/shaders', 'U08TSUSEPMJ', '1767933880.804839', ''],
  ['https://newgenre.studio', 'U08TSUSEPMJ', '1767787323.484109', 'Incredible footer'],
  ['https://www.plasticity.xyz/', 'U09AT94T0PQ', '1767780462.107659', ''],
  ['https://dreamrecorder.ai', 'U08TSUSEPMJ', '1767774869.094419', ''],
  ['https://www.intercom.studio/', 'U09AT94T0PQ', '1767730757.869969', ''],
  ['https://x.com/pdotcv/status/2006019482758648180', 'U08TSUSEPMJ', '1767169722.357529', ''],
  ['https://adrienlamy.fr', 'U08TSUSEPMJ', '1767101256.167889', ''],
  ['https://youtu.be/5SMxKlH7kZM', 'U08TSUSEPMJ', '1766552009.966559', ''],
  ['https://www.nicoleho.net', 'U08TSUSEPMJ', '1766550434.017519', ''],
  ['https://x.com/ewnahh/status/2002314052757049684', 'U08TSUSEPMJ', '1766244864.114679', ''],
  ['https://x.com/seyii___/status/2001959754579796447', 'U08TSUSEPMJ', '1766218439.728009', ''],
  ['https://www.shopify.com/editions/winter2026', 'U09AT94T0PQ', '1765524246.348479', ''],
  ['https://www.glyphic.bio/', 'U09AT94T0PQ', '1766061430.310109', ''],
  ['https://www.seventeenagency.com/', 'U09AT94T0PQ', '1766061207.167939', ''],
  ['https://www.norgram.co/', 'U09AT94T0PQ', '1766061160.727269', ''],
  ['https://x.com/toddham/status/1999549969565471103', 'U08TSUSEPMJ', '1765718406.859529', ''],
  ['https://cmyk.danielpetho.com', 'U08TSUSEPMJ', '1764854301.875969', ''],
  ['https://www.hex.inc/', 'U08TAJW39NK', '1764768516.526409', ''],
  ['https://feather.computer', 'U08TSUSEPMJ', '1764680931.390389', ''],
  ['https://medium.com/@disco_lu/building-agentic-design-systems-the-future-of-ai-enhanced-design-6ad0470cf1e3', 'U08TSUSEPMJ', '1764611217.727869', 'Agentic design systems'],
  ['https://www.vartype.com', 'U08TSUSEPMJ', '1764253070.930989', ''],
  ['https://nodesignfoundry.com', 'U08TSUSEPMJ', '1764253018.229639', ''],
  ['https://other-template.framer.website/', 'U09AT93RXGW', '1764250465.727119', 'For PK website'],
  ['https://www.pentagram.com/archive', 'U08TSUSEPMJ', '1764096339.982069', ''],
  ['https://www.creativeboom.com/insight/how-to-do-motion-first-branding-better/', 'U09AT93RXGW', '1764072832.195069', 'Motion-first branding'],
  ['https://www.mothersauce.nyc', 'U08TSUSEPMJ', '1763969958.782549', 'Look at the footer!'],
  ['https://wearecollins.com', 'U08TSUSEPMJ', '1763720716.678929', ''],
]

// Sort oldest-first so createdAt timestamps roughly match chronological order
RAW_ENTRIES.sort((a, b) => parseFloat(a[2]) - parseFloat(b[2]))

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  })
  return res
}

async function getPreview(url) {
  try {
    const res = await apiFetch(`/references/preview?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function createRef(data) {
  const res = await apiFetch('/references', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return res.json()
}

async function existingRefs() {
  const res = await apiFetch('/references/search?q=')
  if (!res.ok) return []
  const data = await res.json()
  return data.references || []
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Domains where preview won't return useful metadata
const SKIP_PREVIEW_DOMAINS = [
  'x.com', 'twitter.com', 'threads.com',
  'youtu.be', 'youtube.com',
  'figma.com',
]

function shouldSkipPreview(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    return SKIP_PREVIEW_DOMAINS.some((d) => host === d || host.endsWith('.' + d))
  } catch {
    return true
  }
}

async function main() {
  console.log(`Seed references from #references Slack channel`)
  console.log(`  Entries: ${RAW_ENTRIES.length}`)
  console.log(`  Dry run: ${DRY_RUN}`)
  console.log(`  Skip preview: ${SKIP_PREVIEW}`)
  console.log()

  // Check for existing references to avoid duplicates
  let existingTs = new Set()
  try {
    const existing = await existingRefs()
    existingTs = new Set(existing.map((r) => r.slackMessageTs).filter(Boolean))
    console.log(`Found ${existing.length} existing references (${existingTs.size} with slackMessageTs)`)
  } catch (e) {
    console.log(`Could not fetch existing references: ${e.message}`)
  }

  let created = 0
  let skipped = 0
  let errors = 0

  for (const [url, userId, ts, context] of RAW_ENTRIES) {
    const sharedBy = USERS[userId] || userId

    // Skip if already seeded (by Slack timestamp)
    if (existingTs.has(ts)) {
      console.log(`  SKIP (exists): ${url}`)
      skipped++
      continue
    }

    // Try to get preview metadata
    let preview = null
    if (!SKIP_PREVIEW && !shouldSkipPreview(url)) {
      preview = await getPreview(url)
      await sleep(500) // rate limit
    }

    const refData = {
      url,
      title: preview?.title || '',
      description: context || preview?.description || '',
      imageUrl: preview?.imageUrl || '',
      tags: [],
      sharedBy,
      slackMessageTs: ts,
      slackChannel: SLACK_CHANNEL,
    }

    if (DRY_RUN) {
      console.log(`  DRY: ${sharedBy} → ${url}`)
      if (refData.title) console.log(`        title: ${refData.title}`)
      created++
      continue
    }

    try {
      const result = await createRef(refData)
      console.log(`  OK: ${sharedBy} → ${url} (${result.id})`)
      created++
      await sleep(200)
    } catch (e) {
      console.log(`  ERR: ${url} — ${e.message}`)
      errors++
    }
  }

  console.log()
  console.log(`Done: ${created} created, ${skipped} skipped, ${errors} errors`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
