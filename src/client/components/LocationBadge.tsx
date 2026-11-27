/** 袋の保存場所（冷蔵 / 冷凍）の小さなラベル */
export function LocationBadge({ location }: { location: 'fridge' | 'freezer' }) {
  return location === 'freezer' ? (
    <span className="rounded-full bg-frozen-soft px-2.5 py-0.5 text-xs font-medium text-frozen">冷凍</span>
  ) : (
    <span className="rounded-full bg-leaf-soft px-2.5 py-0.5 text-xs font-medium text-leaf">冷蔵</span>
  )
}
