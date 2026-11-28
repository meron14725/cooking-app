import { getProvider } from '../ai'
import type { AiProvider } from '../ai/provider'
import { createDb } from '../db/client'
import { type EstimateWorkflowBinding, type JobStep, runEstimateJob } from '../services/estimateJobs'

/** 本物の Workflow と同じく、1 回分の失敗をこの回数までやり直す（jobs/estimateWorkflow.ts の STEP_CONFIG） */
export const TEST_STEP_RETRIES = 3

/**
 * テスト用の Workflow。create で runEstimateJob を裏で走らせ（await しない）、step.do はその場でリトライする。
 * settled() で走っているジョブが終わるのを待てる
 */
export function createTestWorkflow(opts: { ai?: () => AiProvider } = {}) {
  let env: Env | null = null
  const runs = new Map<string, { status: string; done: Promise<void> }>()
  let statusError: string | null = null
  const step: JobStep = {
    async do(_name, fn) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fn()
        } catch (err) {
          if (attempt >= TEST_STEP_RETRIES) throw err
        }
      }
    },
  }
  const binding: EstimateWorkflowBinding = {
    async create({ id, params }) {
      if (!env) throw new Error('attach(env) を先に呼んでください')
      const e = env
      const run = { status: 'running', done: Promise.resolve() }
      run.done = (async () => {
        // 本物と同じく、作った後で別の処理として動き出す
        await new Promise((r) => setTimeout(r, 0))
        try {
          await runEstimateJob(createDb(e.DB), opts.ai ?? (() => getProvider(e)), params, step)
          if (run.status === 'running') run.status = 'complete'
        } catch {
          run.status = 'errored'
        }
      })()
      runs.set(id, run)
    },
    async get(id) {
      if (statusError) throw new Error(statusError)
      const run = runs.get(id)
      if (!run) throw new Error('instance not found')
      return {
        status: async () => ({ status: run.status }),
        terminate: async () => {
          run.status = 'terminated'
        },
      }
    },
  }
  return {
    binding,
    attach(e: Env) {
      env = e
    },
    /** 走っているジョブが全部終わるまで待つ */
    settled: () => Promise.all([...runs.values()].map((r) => r.done)),
    /** get がこのメッセージで失敗するようにする（null で戻す） */
    failGet(message: string | null) {
      statusError = message
    },
    /** インスタンスの状態を直接変える（落ちたときの確かめ用） */
    setStatus(id: string, status: string) {
      const run = runs.get(id)
      if (run) run.status = status
    },
  }
}
