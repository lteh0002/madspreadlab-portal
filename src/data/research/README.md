# Research reports

Each file in `reports/` is one report on the Research page, written in the format set by
[`research-report.schema.json`](research-report.schema.json). Adding a file adds a card at `/research`
and a page at `/research/<meta.id>`. No code changes are needed.

## Adding a report

1. Save it as `reports/<meta.id>.json`. `meta.id` must be URL-safe (letters, digits, dashes) and unique.
2. Run `npm run dev` and open `/research`. If a file or section is broken, a yellow box on the page
   says what's wrong (dev only). In production the broken part is left out and a warning is logged to the console.
3. Commit the file and deploy.

The card on `/research` shows `meta` (status, as_of, market, instrument_type, tags, subtitle) and the
**first four items of the first `metrics` section**, so put the headline numbers first.

## Conventions the schema doesn't spell out

- **Numbers come from the backtest script, not from writing.** Trades, metrics and chart values
  should be the script's output pasted in as is.
- **`percent` takes a fraction:** `0.61` shows as `61%`.
- **`signed`** shows `+184` / `−30`. Use it for P&L.
- **`unit`** is a key of `meta.units`, for example `"units": { "pts": { "label": "points", "suffix": " pts" },
  "myr": { "label": "MYR", "prefix": "MYR " } }`. A unit that isn't in `meta.units` is shown after
  the value as written.
- **Dates** are `YYYY-MM-DD`. They show as `2 Feb 21` in tables and `Mar 21` on chart axes.
- **Text** (rules, notes, callouts, text sections) can use `**bold**`. Blank lines split a `text` or
  `callout` into paragraphs. No other markdown is rendered.
- **Strings are shown as written** in any format, for composite values like `"+122 / −30"`.

### Charts

- Every series needs exactly as many `values` as `x.values` (and as many `point_tone` entries, if given).
  Use `null` for a gap.
- `style`: `primary` (the main blue line), `comparison` (dashed grey), `muted` (faint).
- `point_tone` puts a marker on each point of a line: green circle (positive), red square (negative),
  grey circle (neutral).
- `point_tone_labels` (optional, added to the schema) names the tones in the legend and tooltip:
  `{ "positive": "Win", "negative": "Stopped", "neutral": "Flat" }`.
- `tone_by_sign` on a bar series colours bars above zero green and below zero red.

### Tables

- `group_by` names a column, which can be `hidden`. Each group header shows the group value as written,
  the row count, a count of each badge value, and the total of the first `tone_by_sign` number column.
- `badge` columns map each value to a tone with `options`, e.g. `{ "Held": "positive", "Stopped": "negative" }`.
- `details` on a row makes it expandable. Its keys are shown as labels (`max_adverse` → "Max adverse").
- On phones the table becomes a list: the first column is the title, the P&L and badge go on the right,
  and the other columns form one line underneath.
