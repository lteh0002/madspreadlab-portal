export interface SpreadInfo {
  /** Matches `spread_name` in the API data and the URL segment, e.g. "1x6" → /spreads/1x6 */
  name: string
  /** Text shown on the button and page title; defaults to `name` */
  label?: string
  description?: string
  /** Route name to open instead of the default cash table page (spread-detail) */
  routeName?: string
  /** Params for `routeName`, e.g. { spreadName: '1x6' } */
  routeParams?: Record<string, string>
  /** Heading on the spread's own page; defaults to "<label> Cash Values" */
  pageTitle?: string
  /**
   * Emoji shown in the card's icon tile, e.g. a country flag "🇯🇵". Takes precedence over
   * `badge`, except on devices that can't draw flag emoji (e.g. Windows), where `badge` is shown.
   */
  emoji?: string
  /** Short text shown in the card's icon tile, e.g. "JPX"; omit both to show a trend icon */
  badge?: string
  /** Extra tags shown on the card (the section title is always shown first) */
  tags?: string[]
  /** Shows the card with a "Soon" pill and no link, until its page or data exists */
  comingSoon?: boolean
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
  /**
   * Bar interval (minutes) every price chart in this group shows. The chart page offers
   * only this interval and hides spreads without data at it. Omit to allow any interval.
   */
  chartInterval?: number
  /**
   * Trading days the chart opens on: T-`chartDays` … T-0, fitted to the width. Days older than
   * T-`chartDays` are labelled "T-X". Zooming out still shows them. Omit for the page default.
   */
  chartDays?: number
}

export interface SpreadSection {
  title: string
  /** Icon shown beside the section heading */
  icon: 'database' | 'trend'
  /** Text for the empty state when the section has no spreads yet */
  emptyText?: string
  /** Sub-groups within the section; a section with no sub-split has a single untitled group */
  groups: SpreadGroup[]
}

/**
 * A product's category: the same three views for each product. Term Structure and Butterfly
 * have no page yet, so they show "Soon".
 * `dbProduct` is the product's name in the database when it differs from the name shown
 * (e.g. FTW is stored as TWN).
 */
function commodityGroup(product: string, dbProduct = product): SpreadGroup {
  const slug = product.toLowerCase()
  return {
    title: product,
    spreads: [
      {
        name: `${slug}-term-structure`,
        label: 'Term Structure',
        description: 'Futures curve across contract months',
        badge: product,
        tags: ['Term Structure'],
        comingSoon: true,
      },
      {
        name: `${slug}-butterfly`,
        label: 'Butterfly',
        description: 'Butterflies across contract months',
        badge: product,
        tags: ['Butterfly'],
        comingSoon: true,
      },
      {
        name: `${slug}-spreads`,
        label: 'Spreads',
        pageTitle: `${product} Spreads`,
        // Same price chart page as the index rolls; needs the product and its data in the database
        routeName: 'product-chart',
        routeParams: { product: dbProduct },
        description: 'Calendar spreads between contract months',
        badge: product,
        tags: ['Spreads'],
      },
    ],
  }
}

/**
 * Layout of the /spreads landing page.
 * To add a button, add a spread to the relevant group's `spreads` list.
 * Each titled group is shown as its own category (sub-heading + cards) within its section;
 * to add a category, add a group.
 */
export const SPREAD_SECTIONS: SpreadSection[] = [
  {
    title: 'Commodities',
    icon: 'database',
    groups: [commodityGroup('FCPO'), commodityGroup('TF')],
  },
  {
    title: 'Indices',
    icon: 'trend',
    groups: [
      {
        title: 'Index Roll',
        chartInterval: 15,
        chartDays: 5,
        spreads: [
          {
            name: 'fair-value',
            label: 'Fair Value',
            routeName: 'fair-value',
            description: 'Historical fair value for indices',
            tags: ['Analytics'],
          },
          {
            name: 'roll-sgp',
            label: 'SGP Roll',
            pageTitle: 'SGP Index Roll',
            // Opens the price chart from the database (price_data), like MCA
            routeName: 'product-chart',
            routeParams: { product: 'SGP' },
            description: 'Singapore index roll',
            emoji: '🇸🇬',
            badge: 'SGP',
            tags: ['Singapore'],
          },
          {
            name: 'roll-twn',
            label: 'FTW Roll',
            pageTitle: 'FTW Index Roll',
            // Opens the price chart from the database (price_data), like MCA
            routeName: 'product-chart',
            routeParams: { product: 'TWN' },
            description: 'Taiwan index roll',
            emoji: '🇹🇼',
            badge: 'FTW',
            tags: ['Taiwan'],
          },
          {
            name: 'roll-mtw',
            label: 'MTW Roll',
            pageTitle: 'MTW Index Roll',
            // Opens the price chart from the database (price_data), like the other rolls
            routeName: 'product-chart',
            routeParams: { product: 'MTW' },
            description: 'MSCI Taiwan index roll',
            emoji: '🇹🇼',
            badge: 'MTW',
            tags: ['Taiwan'],
          },
          {
            name: 'roll-fkli',
            label: 'FKLI Roll',
            pageTitle: 'FKLI Index Roll',
            // Opens the price chart from the database (price_data), like MCA
            routeName: 'product-chart',
            routeParams: { product: 'FKLI' },
            description: 'FBM KLCI index roll',
            emoji: '🇲🇾',
            badge: 'FKLI',
            tags: ['Malaysia'],
          },
          {
            name: 'roll-mca',
            label: 'MCA Roll',
            pageTitle: 'MCA Index Roll',
            // Opens the price chart from the database (price_data), like the other rolls
            routeName: 'product-chart',
            routeParams: { product: 'MCA' },
            description: 'MCA index roll',
            emoji: '🇨🇳',
            badge: 'MCA',
            tags: ['China'],
          },
          {
            name: 'roll-hsi',
            label: 'HSI Roll',
            pageTitle: 'HSI Index Roll',
            // Opens the price chart from the database (price_data), like the other rolls
            routeName: 'product-chart',
            routeParams: { product: 'HSI' },
            description: 'Hang Seng index roll',
            emoji: '🇭🇰',
            badge: 'HSI',
            tags: ['Hong Kong'],
          },
          {
            name: 'roll-cn',
            label: 'CN A50 Roll',
            pageTitle: 'CN A50 Index Roll',
            // Opens the price chart from the database (price_data), like the other rolls
            routeName: 'product-chart',
            routeParams: { product: 'CN' },
            description: 'FTSE China A50 index roll',
            emoji: '🇨🇳',
            badge: 'CN',
            tags: ['China'],
          },
        ],
      },
      {
        title: 'JPX',
        spreads: [
          {
            name: '1x6',
            label: '1×6 Cash',
            pageTitle: 'JPX 1×6 Cash Values',
            description: '10:30 & 14:30 sessions cash value',
            emoji: '🇯🇵',
            badge: 'JPX',
            tags: ['Japan', 'Cash'],
          },
          {
            name: '1x11',
            label: '1×11 Cash',
            pageTitle: 'JPX 1×11 Cash Values',
            description: '10:30 & 14:30 sessions cash value',
            emoji: '🇯🇵',
            badge: 'JPX',
            tags: ['Japan', 'Cash'],
          },
          {
            name: '1x6-chart',
            label: '1×6 Chart',
            pageTitle: 'JPX 1×6 Chart',
            routeName: 'spread-chart',
            routeParams: { spreadName: '1x6' },
            description: 'Historical 1×6 spread chart',
            emoji: '🇯🇵',
            badge: 'JPX',
            tags: ['Japan', 'Chart'],
          },
          {
            name: '1x11-chart',
            label: '1×11 Chart',
            pageTitle: 'JPX 1×11 Chart',
            routeName: 'spread-chart',
            routeParams: { spreadName: '1x11' },
            description: 'Historical 1×11 spread chart',
            emoji: '🇯🇵',
            badge: 'JPX',
            tags: ['Japan', 'Chart'],
          },
        ],
      },
    ],
  },
]
