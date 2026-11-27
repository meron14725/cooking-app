import { Outlet } from 'react-router'
import { TabBar } from './TabBar'

export function Layout() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <main className="flex-1 px-4 pt-4 pb-24">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}
