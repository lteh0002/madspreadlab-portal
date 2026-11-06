export interface SpreadInfo {
  /** Matches `spread_name` in the API data and the URL segment, e.g. "1x6" → /spreads/1x6 */
  name: string
  /** Text shown on the button and page title; defaults to `name` */
  label?: string
  description?: string
}

/** Find a spread by its `name` (the URL segment) */
export function findSpread(name: string): SpreadInfo | undefined {
  for (const section of SPREAD_SECTIONS)
    for (const group of section.groups) {
      const s = group.spreads.find((x) => x.name === name)
      if (s) return s
    }
  return undefined
}

export interface SpreadGroup {
  title: string
  spreads: SpreadInfo[]
}

export interface SpreadSection {
  title: string
  /** Sub-groups within the section; a section with no sub-split has a single untitled group */
  groups: SpreadGroup[]
}

/**
 * Layout of the /spreads landing page.
 * To add a button, add a spread to the relevant group's `spreads` list.
 */
export const SPREAD_SECTIONS: SpreadSection[] = [
  {
    title: 'Commodities',
    groups: [{ title: '', spreads: [] }],
  },
  {
    title: 'Indices',
    groups: [
      { title: 'Index Roll', spreads: [] },
      {
        title: 'Indices Cash',
        spreads: [{ name: '1x6', label: 'JPX 1x6', description: '10:30 & 14:30 sessions' }],
      },
    ],
  },
]
