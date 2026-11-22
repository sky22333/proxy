import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

interface FormRowProps {
  label: string
  hint?: string
  /** 控件右侧的附加按钮，例如「重新生成」 */
  action?: ReactNode
  children: ReactNode
}

/** 左侧固定标签列 + 右侧控件列，参数卡、服务器卡、证书卡共用同一套栅格 */
export function FormRow({ label, hint, action, children }: FormRowProps) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-3">
      <Label className="pt-1.5 text-xs leading-none font-normal text-muted-foreground">
        {label}
      </Label>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">{children}</div>
          {action}
        </div>
        {hint && <p className="text-[11px] leading-snug text-muted-foreground/80">{hint}</p>}
      </div>
    </div>
  )
}
