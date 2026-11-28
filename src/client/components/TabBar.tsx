import { Link, useLocation } from 'react-router'
import { Icon, type IconName } from './Icon'
import { TAB_ROOT_STATE } from './PageHeader'

const tabs: { to: string; label: string; icon: IconName; paths: string[] }[] = [
  { to: '/', label: 'ホーム', icon: 'home', paths: [] },
  { to: '/fridge', label: '冷蔵庫', icon: 'fridge', paths: ['/fridge'] },
  { to: '/plan', label: '献立', icon: 'calendar', paths: ['/plan'] },
  { to: '/recipes', label: 'レシピ', icon: 'book', paths: ['/recipes'] },
  { to: '/more', label: 'その他', icon: 'more', paths: ['/more', '/ingredients', '/agent'] },
]

/** 画面の下に浮いたカプセル型のタブバー。今いるタブは白い丸 */
export function TabBar() {
  const { pathname } = useLocation()
  const isActive = (tab: (typeof tabs)[number]) =>
    tab.to === '/' ? pathname === '/' : tab.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  return (
    // 高さを変えたら index.css の --tabbar-h も直す
    <nav
      aria-label="メインメニュー"
      className="pointer-events-none fixed inset-x-0 bottom-0 px-4 pb-[calc(16px+env(safe-area-inset-bottom))]"
    >
      <ul className="pointer-events-auto mx-auto grid max-w-[calc(28rem-2rem)] grid-cols-5 rounded-[32px] bg-tab p-2 shadow-tabbar">
        {tabs.map((tab) => {
          const active = isActive(tab)
          return (
            <li key={tab.to}>
              <Link
                to={tab.to}
                // タブで開いた画面はそのタブの始まり。戻るボタンは別のタブへ戻らず、画面の親へ行く（PageHeader の useGoBack）
                state={TAB_ROOT_STATE}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-3xl text-[11px] ${
                  active ? 'bg-surface font-bold text-accent-strong' : 'text-tab-ink'
                }`}
              >
                <Icon name={tab.icon} size={22} strokeWidth={active ? 1.9 : 1.8} />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
