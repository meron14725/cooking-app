import { Outlet, useLocation } from 'react-router'
import { AuthExpiredBanner } from './AuthExpiredBanner'
import { TabBar } from './TabBar'

/** 調理は 1 ステップずつの全画面（タブバーなし） */
const FULL_SCREEN = /^\/kits\/[^/]+\/cook$/

export function Layout() {
  const { pathname } = useLocation()
  const full = FULL_SCREEN.test(pathname)
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <AuthExpiredBanner />
      {full ? (
        <Outlet />
      ) : (
        <>
          <main className="flex-1 px-5 pt-7 pb-32">
            <Outlet />
          </main>
          <TabBar />
        </>
      )}
    </div>
  )
}
