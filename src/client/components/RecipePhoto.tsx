import { useState } from 'react'
import { imagePath } from '../../shared/domain/images'
import { Icon } from './Icon'

/**
 * レシピの完成写真（R2 から GET /api/images/{key}）。キーがない・まだ上がっていないときはプレースホルダ。
 * 大きさと角丸は className で決める
 */
export function RecipePhoto({ imageKey, className = '' }: { imageKey: string | null; className?: string }) {
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const show = imageKey !== null && failedKey !== imageKey
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden bg-sunken text-ink-muted ${className}`}>
      {show ? (
        <img
          src={imagePath(imageKey)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedKey(imageKey)}
          className="size-full object-cover"
        />
      ) : (
        <Icon name="image" size={22} strokeWidth={1.6} />
      )}
    </span>
  )
}
