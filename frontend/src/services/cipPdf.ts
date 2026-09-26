import type { CipPlan } from '@/types/cip'
import type { PoiCategory, ResidentialZone } from '@/types/geography'
import type { SimulationResult } from '@/types/simulation'
import { categoryMeta, categorySingular } from '@/utils/categories'
import { formatBudgetMillions, formatUsd, sectorMeta } from '@/utils/facilityCosts'
import { formatPopulation } from '@/utils/constants'

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 58
const LINE = 13
const FOOTER_TOP = 46

function pdfEscape(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function wrap(text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > width && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

function pdfY(top: number) {
  return PAGE_H - top
}

class PdfDoc {
  private pages: string[][] = [[]]
  private y = 118
  docId = ''
  dateLabel = ''

  private get page() {
    return this.pages[this.pages.length - 1]
  }

  private text(font: '/F1' | '/F2' | '/F3', size: number, x: number, top: number, value: string) {
    this.page.push(`BT ${font} ${size} Tf ${x.toFixed(1)} ${pdfY(top).toFixed(1)} Td (${pdfEscape(value)}) Tj ET`)
  }

  private rule(top: number, weight = 0.6) {
    this.page.push(
      `q ${weight} w 0 0 0 RG ${MARGIN} ${pdfY(top).toFixed(1)} m ${PAGE_W - MARGIN} ${pdfY(top).toFixed(1)} l S Q`,
    )
  }

  private ensure(height: number) {
    if (this.y + height <= PAGE_H - FOOTER_TOP - 18) return
    this.pages.push([])
    this.y = 78
  }

  letterhead(date: string, docId: string, subject: string, subtitle: string) {
    this.docId = docId
    this.dateLabel = date
    this.page.push('q 0 0 0 RG 1.6 w')
    this.page.push(`${MARGIN} ${pdfY(36).toFixed(1)} m ${PAGE_W - MARGIN} ${pdfY(36).toFixed(1)} l S`)
    this.page.push('0.4 w')
    this.page.push(`${MARGIN} ${pdfY(40).toFixed(1)} m ${PAGE_W - MARGIN} ${pdfY(40).toFixed(1)} l S Q`)
    this.text('/F2', 9, MARGIN, 54, 'CITY OF ATLANTA')
    this.text('/F1', 8, MARGIN, 66, 'Department of City Planning  ·  Office of Transit System Planning')
    this.text('/F2', 8, PAGE_W - MARGIN - 168, 54, 'METROPOLITAN ATLANTA')
    this.text('/F1', 8, PAGE_W - MARGIN - 168, 66, 'Rapid Transit Authority (MARTA)')
    this.rule(74, 0.9)
    this.text('/F2', 16, MARGIN, 94, 'Capital Improvement Program Brief')
    this.text('/F3', 10, MARGIN, 110, subtitle)
    this.y = 124
    this.memoRow('TO', 'City Council; MARTA Board of Directors; Office of the Mayor')
    this.memoRow('FROM', 'Ripple access model, prepared for staff discussion')
    this.memoRow('DATE', date)
    this.memoRow('SUBJECT', subject)
    this.memoRow('CONTROL NO.', docId)
    this.spacer(6)
    this.rule(this.y, 0.5)
    this.y += 12
  }

  private memoRow(label: string, value: string) {
    this.ensure(14)
    this.text('/F2', 9, MARGIN, this.y, `${label}:`)
    const lines = wrap(value, 78)
    for (const [index, line] of lines.entries()) {
      if (index > 0) this.ensure(12)
      this.text('/F1', 10, MARGIN + 78, this.y, line)
      this.y += 13
    }
  }

  section(number: string, title: string) {
    this.ensure(34)
    this.y += 6
    this.text('/F2', 12, MARGIN, this.y, `${number}   ${title.toUpperCase()}`)
    this.y += 6
    this.rule(this.y, 0.7)
    this.y += 14
  }

  subsection(number: string, title: string) {
    this.ensure(22)
    this.y += 4
    this.text('/F2', 11, MARGIN, this.y, `${number}  ${title}`)
    this.y += 15
  }

  body(text: string, width = 90) {
    for (const line of wrap(text, width)) {
      this.ensure(LINE)
      this.text('/F1', 10, MARGIN, this.y, line)
      this.y += LINE
    }
  }

  italic(text: string, width = 90) {
    for (const line of wrap(text, width)) {
      this.ensure(LINE)
      this.text('/F3', 10, MARGIN, this.y, line)
      this.y += LINE
    }
  }

  bullet(text: string) {
    const lines = wrap(text, 84)
    for (const [index, line] of lines.entries()) {
      this.ensure(LINE + 1)
      if (index === 0) {
        const cy = pdfY(this.y - 3.2)
        this.page.push(`q 0 0 0 rg ${MARGIN + 2} ${cy.toFixed(1)} 3 3 re f Q`)
      }
      this.text('/F1', 10, MARGIN + 16, this.y, line)
      this.y += LINE
    }
    this.y += 2
  }

  spacer(px = 8) {
    this.y += px
  }

  private frame(body: string[], pageIndex: number, total: number) {
    const running = [
      `q 0.6 w 0 0 0 RG ${MARGIN} ${pdfY(36).toFixed(1)} m ${PAGE_W - MARGIN} ${pdfY(36).toFixed(1)} l S Q`,
      `BT /F2 8 Tf ${MARGIN} ${pdfY(50).toFixed(1)} Td (${pdfEscape('CITY OF ATLANTA  ·  CAPITAL IMPROVEMENT PROGRAM')}) Tj ET`,
      `BT /F1 8 Tf ${PAGE_W - MARGIN - 132} ${pdfY(50).toFixed(1)} Td (${pdfEscape(this.docId)}) Tj ET`,
    ]
    const footer = [
      `q 0.6 w 0 0 0 RG ${MARGIN} 40 m ${PAGE_W - MARGIN} 40 l S Q`,
      `BT /F1 8 Tf ${MARGIN} 26 Td (${pdfEscape('For official planning use  ·  Not an engineering or acquisition document')}) Tj ET`,
      `BT /F1 8 Tf ${PAGE_W - MARGIN - 72} 26 Td (${pdfEscape(`Page ${pageIndex} of ${total}`)}) Tj ET`,
    ]
    if (pageIndex === 1) return [...body, ...footer]
    return [...running, ...body, ...footer]
  }

  build() {
    const objects: string[] = []
    objects.push('<< /Type /Catalog /Pages 2 0 R >>')
    objects.push('')
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>')
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>')
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>')
    const fontBlock = '/F1 3 0 R /F2 4 0 R /F3 5 0 R'
    const pageIds: number[] = []
    const total = this.pages.length

    for (const [index, commands] of this.pages.entries()) {
      const stream = this.frame(commands, index + 1, total).join('\n')
      const contentId = objects.length + 1
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
      const pageId = objects.length + 1
      pageIds.push(pageId)
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << ${fontBlock} >> >> >>`,
      )
    }

    objects[1] =
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

    let output = '%PDF-1.4\n'
    const offsets = [0]
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(output.length)
      output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
    }
    const xref = output.length
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (let index = 1; index <= objects.length; index += 1) {
      output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
    }
    output += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
    return new Blob([output], { type: 'application/pdf' })
  }
}

function incomeHeadline(zones: ResidentialZone[], result: SimulationResult | null) {
  if (!result) return null
  const helped = result.zoneImpacts
  const rows = helped
    .map((impact) => {
      const zone = zones.find((item) => item.id === impact.zoneId)
      return zone?.medianIncome != null ? { income: zone.medianIncome, pop: impact.population } : null
    })
    .filter((row): row is { income: number; pop: number } => row != null)
  const total = rows.reduce((sum, row) => sum + row.pop, 0)
  if (!total) return null
  const avg = rows.reduce((sum, row) => sum + row.income * row.pop, 0) / total
  const all = zones.filter((zone) => zone.medianIncome != null && zone.population > 0)
  const allPop = all.reduce((sum, zone) => sum + zone.population, 0)
  const cityAvg = allPop
    ? all.reduce((sum, zone) => sum + (zone.medianIncome as number) * zone.population, 0) / allPop
    : null
  if (cityAvg == null) return `Helped communities have a population-weighted median income of ${formatUsd(avg)}.`
  if (avg < cityAvg * 0.92) {
    return `Benefits tilt toward lower-income areas: helped communities average ${formatUsd(avg)} versus ${formatUsd(cityAvg)} citywide.`
  }
  if (avg > cityAvg * 1.08) {
    return `Helped communities average ${formatUsd(avg)} versus ${formatUsd(cityAvg)} citywide; review siting if equity is the primary goal.`
  }
  return `Income mix of helped communities (${formatUsd(avg)}) is close to the citywide average (${formatUsd(cityAvg)}).`
}

function controlNumber(generatedAt: string) {
  const stamp = new Date(generatedAt)
  const y = stamp.getFullYear()
  const m = String(stamp.getMonth() + 1).padStart(2, '0')
  const d = String(stamp.getDate()).padStart(2, '0')
  return `ATL-CIP-${y}${m}${d}`
}

export function buildCipPdf(input: {
  plan: CipPlan
  zones: ResidentialZone[]
  result: SimulationResult | null
}) {
  const { plan, zones, result } = input
  const doc = new PdfDoc()
  const date = new Date(plan.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const sector = sectorMeta(plan.sector)
  const names = sector.categories.map((category) => categorySingular(category).toLowerCase()).join(', ')
  doc.letterhead(
    date,
    controlNumber(plan.generatedAt),
    `${sector.label} sector capital package to reduce MARTA travel time`,
    `Scope: ${sector.brief}. Eligible destinations: ${names}.`,
  )

  doc.section('1.', 'Purpose')
  doc.body(
    `This brief recommends a constrained ${sector.label.toLowerCase()} capital package of new destinations so that Atlanta residents, especially those who rely on MARTA, can reach those services in less time. Spending is limited to ${names}; other facility types are out of scope. It is written for elected officials, board members, and department heads who must justify where limited capital should go.`,
  )

  doc.section('2.', 'Planning constraints')
  doc.subsection('2.1', 'Budget ceiling and sector')
  doc.body(
    `The package stays within a ${formatBudgetMillions(plan.budget)} capital ceiling, scoped to the ${sector.label.toLowerCase()} sector (${sector.brief.toLowerCase()}). Planning-level construction allowances total ${formatUsd(plan.spent)}. ${formatUsd(plan.leftover)} is left unallocated rather than forcing a weaker extra site that would not clear the travel-time test.`,
  )
  doc.subsection('2.2', 'Network and assignment rules')
  if (plan.disruptionStationNames.length > 0) {
    doc.body(
      `Siting accounts for the current disruption at ${plan.disruptionStationNames.join('; ')}, so recommended facilities still help if those stations remain out of service.`,
    )
  } else {
    doc.body(
      'No stations are failed in the live scenario. Deficiencies still flag trips that become much longer if a critical MARTA station closes.',
    )
  }
  doc.body(
    'Hospitals, clinics, groceries, and libraries may serve whoever is closest in travel time. Schools, universities, and government sites remain tied to geographic catchments: a new site helps a neighborhood only when it is closer on the ground than the current assigned facility.',
  )
  doc.body(
    'A site is recommended only if it shortens a modeled walk-plus-rail trip by at least 15 minutes for one or more communities. Unit costs are planning allowances for comparison, not bid estimates.',
  )

  doc.section('3.', 'Access deficiencies')
  if (plan.gaps.length === 0) {
    doc.body('No outstanding access gaps crossed the planning threshold under the current network.')
  } else {
    doc.body(
      'Neighborhoods were ranked by long travel times, transit-dependent demand, household income and vehicle access, and extra delay if a key station fails. Leading deficiencies are as follows:',
    )
    doc.spacer(4)
    for (const gap of plan.gaps.slice(0, 8)) {
      doc.bullet(gap.summary)
    }
  }

  doc.section('4.', 'Recommended capital package')
  if (plan.projects.length === 0) {
    doc.body(
      `Nothing in the facility menu both fits the remaining budget and clears the 15-minute gain rule. Raise the budget above ${formatUsd(plan.budget)} or inspect a disruption scenario to surface additional need.`,
    )
  } else {
    doc.body(
      'Facilities are added in order of rider-minutes saved per dollar. Types that would consume budget without beating a cheaper mix are skipped. The package does not force one of every facility type.',
    )
    for (const [index, project] of plan.projects.entries()) {
      const label = categorySingular(project.category)
      const near = project.nearestStationName ? ` near ${project.nearestStationName}` : ''
      doc.subsection(`4.${index + 1}`, `${label}${near}  —  ${formatUsd(project.cost)}`)
      doc.bullet(
        `Location (WGS 84): ${project.latitude.toFixed(4)} N, ${Math.abs(project.longitude).toFixed(4)} W.`,
      )
      doc.bullet(
        `About ${project.regionsHelped} communities save 15 minutes or more (${Math.round(project.personMinutes).toLocaleString('en-US')} modeled rider-minutes).`,
      )
      doc.bullet(project.rationale)
    }
  }

  doc.section('5.', 'Estimated community benefits')
  doc.subsection('5.1', 'Quantitative findings')
  if (result && result.zoneImpacts.length > 0) {
    const trips = result.zoneImpacts.reduce((sum, impact) => sum + impact.estimatedTrips, 0)
    doc.body(
      `With these sites placed in the live access model, ${formatPopulation(result.summary.populationAffected)} residents in ${result.summary.zonesAffected} communities save an average of ${result.summary.averageAddedTravelMinutes.toFixed(1)} minutes on their worst improved trip. Modeled daily transit-dependent trips helped: ${Math.round(trips).toLocaleString('en-US')}.`,
    )
    const byCategory = new Map<string, number>()
    for (const impact of result.zoneImpacts) {
      byCategory.set(impact.poiCategory, (byCategory.get(impact.poiCategory) ?? 0) + impact.population)
    }
    const mix = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, population]) => `${categoryMeta(category as PoiCategory)?.label ?? category} (${formatPopulation(population)})`)
    if (mix.length > 0) {
      doc.body('Population reached by facility type:')
      doc.spacer(3)
      for (const item of mix) doc.bullet(item)
    }
    const equity = incomeHeadline(zones, result)
    if (equity) doc.body(equity)
    const named = [...new Set(result.zoneImpacts.slice(0, 6).map((impact) => impact.zoneName))]
    if (named.length > 0) {
      doc.body(`Largest modeled time savings include ${named.join('; ')}.`)
    }
  } else {
    const personMinutes = plan.projects.reduce((sum, project) => sum + project.personMinutes, 0)
    const regions = plan.projects.reduce((sum, project) => sum + project.regionsHelped, 0)
    doc.body(
      `Planning-stage estimate before the live overlay: about ${Math.round(personMinutes).toLocaleString('en-US')} rider-minutes saved across ${regions} community-facility pairs, counting only improvements of 15 minutes or better.`,
    )
  }
  doc.subsection('5.2', 'Qualitative findings')
  doc.body(
    'New sites shorten everyday errands and care trips, add a closer option when rail is disrupted, and concentrate investment where travel times, vehicle access, and station fragility coincide. Schools, universities, and government offices still serve geographic catchments, so they stabilize neighborhood assignment rather than pulling riders across the region.',
  )

  doc.section('6.', 'Limitations and intended use')
  doc.body(
    'This document is a conversation piece for budget, planning, and transit staff. It is not an engineering siting study, a property-acquisition plan, or a guarantee of ridership.',
  )
  doc.body(
    'Costs are round-number capital allowances so a mix can be compared under a single ceiling. Travel times combine walk access and MARTA rail; they do not include traffic congestion or bus run times.',
  )
  doc.spacer(8)
  doc.italic('Prepared with Ripple, a MARTA access explorer, for internal briefing only.')

  return doc.build()
}

export function downloadCipPdf(plan: CipPlan, zones: ResidentialZone[], result: SimulationResult | null) {
  const blob = buildCipPdf({ plan, zones, result })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const stamp = new Date(plan.generatedAt).toISOString().slice(0, 10)
  anchor.href = url
  anchor.download = `Atlanta-CIP-Brief-${stamp}.pdf`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
