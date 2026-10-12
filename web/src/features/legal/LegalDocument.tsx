import { Fragment, type ReactNode } from 'react'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'

/**
 * Renders the legal texts (H2/H3) from their verbatim source: the small markdown subset
 * texts.ts uses, and nothing more. A library would be a dependency for five patterns.
 */

/** `**bold**` and `[text](url)` inside one line. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /\*\*(.+?)\*\*|\[(.+?)\]\((https?:\/\/[^)\s]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      out.push(
        <strong key={m.index} className="font-semibold text-text-primary">
          {inline(m[1])}
        </strong>,
      )
    } else {
      out.push(
        <a key={m.index} href={m[3]} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
          {m[2]}
        </a>,
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function cells(row: string): string[] {
  return row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
}

/** The document body, without its `# ` title (the page renders that as the h1). */
export function LegalDocument({ source }: { source: string }) {
  const blocks = source.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className="space-y-lg">
      {blocks.map((block, i) => {
        if (block.startsWith('# ')) return null
        if (block.startsWith('> ')) {
          return (
            <div key={i} className="rounded-md bg-warning-bg px-lg py-md text-body text-warning-text leading-relaxed">
              {inline(block.replace(/^>\s?/gm, ''))}
            </div>
          )
        }
        if (block.startsWith('|')) {
          const [head = '', , ...rows] = block.split('\n')
          return (
            <TableWrap key={i}>
              <Table>
                <thead>
                  <tr>
                    {cells(head).map((c) => (
                      <Th key={c}>{c}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r}>
                      {cells(r).map((c, j) => (
                        <Td key={j} className="align-top whitespace-normal">
                          {inline(c)}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )
        }
        return (
          <p key={i} className="text-body text-text-secondary leading-relaxed">
            {block.split('\n').map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}

/** The `# ` title line of a document. */
export function legalTitle(source: string): string {
  return source.match(/^# (.+)$/m)?.[1] ?? ''
}
