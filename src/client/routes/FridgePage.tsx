import { PageHeader } from '../components/PageHeader'

export function FridgePage() {
  return (
    <>
      <PageHeader title="冷蔵庫" />
      <p className="text-stone-600">冷蔵・冷凍の中身が期限の近い順に並びます。</p>
    </>
  )
}
