import { Link, useLocation } from 'react-router'

const tabs = [
  { to: '/', label: 'ホーム', icon: '🏠', paths: [] },
  { to: '/fridge', label: '冷蔵庫', icon: '🧊', paths: ['/fridge'] },
  { to: '/plan', label: '献立', icon: '🛒', paths: ['/plan'] },
  { to: '/recipes', label: 'レシピ', icon: '📖', paths: ['/recipes'] },
  { to: '/more', label: 'その他', icon: '⋯', paths: ['/more', '/ingredients'] },
] as const

export function TabBar() {
  const { pathname } = useLocation()
  const isActive = (tab: (typeof tabs)[number]) =>
    tab.to === '/' ? pathname === '/' : tab.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map((tab) => {
          const active = isActive(tab)
          return (
            <li key={tab.to}>
              <Link
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                  active ? 'font-bold text-orange-600' : 'text-stone-500'
                }`}
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
