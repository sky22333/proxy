import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { tokenizeJson, type TokenKind } from '@/lib/highlight'
import { cn } from '@/lib/utils'

const KIND_CLASS: Record<TokenKind, string> = {
  key: 'text-muted-foreground',
  string: 'text-emerald-700 dark:text-emerald-400',
  number: 'text-sky-700 dark:text-sky-400',
  literal: 'text-violet-700 dark:text-violet-400',
  plain: 'text-foreground/75',
}

/** 高亮层与输入层必须逐字节共用这套排版，否则会出现错位重影 */
const LAYOUT =
  'm-0 p-0 font-mono text-xs leading-[1.7] tracking-normal whitespace-pre-wrap break-all'

interface JsonEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function JsonEditor({ value, onChange, className }: JsonEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  /** 高亮滞后一帧：大文本输入时不让着色阻塞按键回显 */
  const deferredValue = useDeferredValue(value)
  const tokens = useMemo(() => tokenizeJson(deferredValue), [deferredValue])
  /** 输入法组字期文字是透明的，会看不见；此时临时让高亮层让位 */
  const [composing, setComposing] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const sync = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [value])

  return (
    <div className={cn('relative', className)}>
      <pre
        aria-hidden
        className={cn(
          LAYOUT,
          'pointer-events-none absolute inset-0 overflow-hidden',
          composing && 'opacity-0',
        )}
      >
        {tokens.map((token, index) => (
          <span key={index} className={KIND_CLASS[token.kind]}>
            {token.text}
          </span>
        ))}
      </pre>
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        aria-label="config.json 内容"
        className={cn(
          LAYOUT,
          'relative block min-h-[240px] w-full resize-none overflow-hidden bg-transparent caret-foreground outline-none selection:bg-sky-500/25',
          composing ? 'text-foreground' : 'text-transparent',
        )}
      />
    </div>
  )
}
