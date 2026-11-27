import { useState } from 'react'
import { useNavigate } from 'react-router'
import { aiErrorMessage, useImportRecipe } from '../api/recipes'
import { Button, Field, inputClass } from '../components/form'
import { PageHeader } from '../components/PageHeader'

/** S11 URL 取り込み: URL を貼る → AI が下書きを作る → 編集画面で確認・修正して保存 */
export function RecipeImportPage() {
  const navigate = useNavigate()
  const importRecipe = useImportRecipe()
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      new URL(url.trim())
    } catch {
      setError('URL を貼り付けてください')
      return
    }
    try {
      const draft = await importRecipe.mutateAsync(url.trim())
      navigate('/recipes/new', { state: { draft } })
    } catch (err) {
      setError(aiErrorMessage(err))
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <PageHeader title="URL から取り込む" backTo="/recipes" />
      <p className="text-sm text-ink-soft">
        レシピのページの URL を貼ると、AI
        が材料と手順を読み取って下書きを作ります。ホットクック向けに直した点は、次の画面で確認できます。保存するまでは登録されません。
      </p>
      <Field label="レシピの URL" error={error ?? undefined}>
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          className={inputClass}
          disabled={importRecipe.isPending}
        />
      </Field>
      {importRecipe.isPending && <p className="text-sm text-ink-muted">読み取り中です。数十秒かかることがあります…</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={importRecipe.isPending || !url.trim()} className="flex-1">
          {importRecipe.isPending ? '読み取り中…' : '読み取る'}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/recipes')}>
          戻る
        </Button>
      </div>
    </form>
  )
}
