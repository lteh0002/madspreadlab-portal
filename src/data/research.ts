export interface ResearchMetric {
  /** e.g. "Win rate", "Avg P&L", "Trades" */
  label: string
  /** Shown as written, e.g. "62%", "+1.8 pts", "48" */
  value: string
}

export interface ResearchNote {
  /** Unique, URL-safe, e.g. "mca-roll-t3-entry" */
  id: string
  title: string
  /** YYYY-MM-DD the backtest was run or written up; notes are listed newest first */
  date: string
  /** Products tested, e.g. ["MCA", "SGP"] */
  products?: string[]
  /** Extra tags, e.g. ["Index Roll", "Mean reversion"] */
  tags?: string[]
  /** Still running or being checked; shows an "In progress" pill */
  inProgress?: boolean
  /** One or two sentences: what was tested and over what period */
  summary: string
  /** Headline numbers, shown as tiles */
  metrics?: ResearchMetric[]
  /** Findings, one point each */
  findings?: string[]
}

/**
 * Backtests and findings shown on the Research page. To add one, add a note to this list
 * (order doesn't matter; the page sorts by date). Example:
 *
 * {
 *   id: 'mca-roll-t3-entry',
 *   title: 'MCA roll: entering at T-3 vs T-1',
 *   date: '2026-11-13',
 *   products: ['MCA'],
 *   tags: ['Index Roll'],
 *   summary: 'Entered the roll at T-3 and T-1 on every expiry from Jan 2024 to Oct 2026.',
 *   metrics: [
 *     { label: 'Trades', value: '34' },
 *     { label: 'Win rate', value: '62%' },
 *   ],
 *   findings: [
 *     'T-3 entries filled 0.4 pts better on average.',
 *     'The edge disappears on quarterly expiries.',
 *   ],
 * },
 */
export const RESEARCH_NOTES: ResearchNote[] = []
