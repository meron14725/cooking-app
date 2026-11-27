import { PageHeader } from '../components/PageHeader'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="ページが見つかりません" />
      <p className="text-ink-soft">メニューから選び直してください。</p>
    </>
  )
}
