import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { PageHeader } from '../components/PageHeader'

export function HomePage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ ok: boolean; today: string }>('/health'),
  })

  return (
    <>
      <PageHeader title="ホーム" />
      <p className="text-stone-600">ここに「今日はこの袋」と期限が近いものが並びます。</p>
      <p className="mt-6 text-xs text-stone-400">
        API: {health.isPending ? '確認中…' : health.isError ? '接続できません' : `OK（${health.data.today}）`}
      </p>
    </>
  )
}
