import { useEffect, useState } from 'react'
import { AUTH_EXPIRED_EVENT } from '../api/client'

/** ログインが切れたら、再読み込み（= Access のログイン画面へ）を促す */
export function AuthExpiredBanner() {
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const onExpired = () => setExpired(true)
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  if (!expired) return null

  return (
    <div role="alert" className="sticky top-0 z-10 flex items-center gap-3 bg-warn-soft px-4 py-3 text-sm text-warn">
      <span className="flex-1">ログインの有効期限が切れました。</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-11 rounded-control bg-accent px-4 font-bold text-white"
      >
        再読み込み
      </button>
    </div>
  )
}
