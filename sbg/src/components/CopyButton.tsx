import { Check, Copy } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
  value: string
  label?: string
  className?: string
  variant?: 'outline' | 'ghost' | 'secondary' | 'default'
  size?: 'xs' | 'sm' | 'default' | 'icon-xs' | 'icon-sm' | 'icon'
  iconOnly?: boolean
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function CopyButton({
  value,
  label = '复制',
  className,
  variant = 'outline',
  size = 'sm',
  iconOnly = false,
}: CopyButtonProps) {
  const [done, setDone] = useState(false)
  const timer = useRef<number | null>(null)

  async function handleClick() {
    const ok = await writeClipboard(value)
    if (!ok) {
      const area = document.createElement('textarea')
      area.value = value
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    setDone(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDone(false), 1400)
  }

  const Icon = done ? Check : Copy

  if (iconOnly) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        className={cn('text-muted-foreground', className)}
        aria-label={done ? '已复制' : label}
      >
        <Icon />
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      className={cn('gap-1.5', className)}
    >
      <Icon />
      {done ? '已复制' : label}
    </Button>
  )
}
