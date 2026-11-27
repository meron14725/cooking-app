import { NavLink } from 'react-router'

const tabs = [
  { to: '/', label: 'ホーム', icon: '🏠', end: true },
  { to: '/fridge', label: '冷蔵庫', icon: '🧊', end: false },
  { to: '/plan', label: '献立', icon: '🛒', end: false },
  { to: '/recipes', label: 'レシピ', icon: '📖', end: false },
  { to: '/more', label: 'その他', icon: '⋯', end: false },
] as const

export function TabBar() {
  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                  isActive ? 'font-bold text-orange-600' : 'text-stone-500'
                }`
              }
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {tab.icon}
              </span>
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
