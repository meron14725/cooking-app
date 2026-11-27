import { Link, useLocation } from 'react-router'
import { Icon, type IconName } from './Icon'

const tabs: { to: string; label: string; icon: IconName; paths: string[] }[] = [
  { to: '/', label: 'ホーム', icon: 'home', paths: [] },
  { to: '/fridge', label: '冷蔵庫', icon: 'fridge', paths: ['/fridge'] },
  { to: '/plan', label: '献立', icon: 'calendar', paths: ['/plan'] },
  { to: '/recipes', label: 'レシピ', icon: 'book', paths: ['/recipes'] },
  { to: '/more', label: 'その他', icon: 'more', paths: ['/more', '/ingredients', '/agent'] },
]

export function TabBar() {
  const { pathname } = useLocation()
  const isActive = (tab: (typeof tabs)[number]) =>
    tab.to === '/' ? pathname === '/' : tab.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  return (
    // 高さを変えたら index.css の --tabbar-h も直す
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 px-2 pt-1.5 pb-1.5">
        {tabs.map((tab) => {
          const active = isActive(tab)
          return (
            <li key={tab.to}>
              <Link
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-13 flex-col items-center justify-center gap-[3px] text-[11px] ${
                  active ? 'font-bold text-accent' : 'text-ink-muted'
                }`}
              >
                <Icon name={tab.icon} size={24} />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
