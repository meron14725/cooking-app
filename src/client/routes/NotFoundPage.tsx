import { PageHeader } from '../components/PageHeader'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="ページが見つかりません" />
      <p className="text-stone-600">メニューから選び直してください。</p>
    </>
  )
}
