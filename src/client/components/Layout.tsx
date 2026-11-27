import { Outlet } from 'react-router'
import { AuthExpiredBanner } from './AuthExpiredBanner'
import { TabBar } from './TabBar'

export function Layout() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <AuthExpiredBanner />
      <main className="flex-1 px-5 pt-7 pb-28">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}
