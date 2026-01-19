import { useState, useEffect } from 'react'
import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

export function AutoApproveToggle(): React.JSX.Element {
  const [autoApprove, setAutoApprove] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSetting()
  }, [])

  async function loadSetting() {
    try {
      const enabled = await window.api.settings.getAutoApprove()
      setAutoApprove(enabled)
    } catch (e) {
      console.error('Failed to load auto-approve setting:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleChange(checked: boolean) {
    setAutoApprove(checked)
    try {
      await window.api.settings.setAutoApprove(checked)
    } catch (e) {
      console.error('Failed to save auto-approve setting:', e)
      setAutoApprove(!checked)
    }
  }

  if (loading) {
    return <div className="h-5 w-[88px]" />
  }

  return (
    <div className="flex items-center gap-1.5">
      {autoApprove ? (
        <ShieldAlert className="size-3.5 text-status-warning" />
      ) : (
        <ShieldCheck className="size-3.5 text-muted-foreground" />
      )}
      <span className="text-xs text-muted-foreground">Auto</span>
      <Switch
        checked={autoApprove}
        onCheckedChange={handleChange}
        className="scale-75 origin-left"
      />
    </div>
  )
}
