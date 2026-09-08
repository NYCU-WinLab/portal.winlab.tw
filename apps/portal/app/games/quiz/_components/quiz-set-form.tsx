"use client"

import { useState } from "react"
import { toast } from "sonner"
import { IconChevronDown, IconChevronUp, IconTrash } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"

import type { QuizQuestionDraft } from "@/hooks/games/use-quiz-sets"

interface QuestionDraft extends QuizQuestionDraft {
  key: string
}

function blankQuestion(): QuestionDraft {
  return {
    key: crypto.randomUUID(),
    question_text: "",
    choices: ["", ""],
    correct_index: 0,
    time_limit_seconds: 20,
  }
}

interface QuizSetFormProps {
  initialTitle?: string
  initialQuestions?: QuizQuestionDraft[]
  submitLabel: string
  onSubmit: (title: string, questions: QuizQuestionDraft[]) => Promise<void>
}

export function QuizSetForm({
  initialTitle = "",
  initialQuestions,
  submitLabel,
  onSubmit,
}: QuizSetFormProps) {
  const [title, setTitle] = useState(initialTitle)
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    initialQuestions?.length
      ? initialQuestions.map((q) => ({ ...q, key: crypto.randomUUID() }))
      : [blankQuestion()]
  )
  const [saving, setSaving] = useState(false)

  const updateQuestion = (key: string, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.key === key ? { ...q, ...patch } : q))
    )
  }

  const updateChoice = (key: string, index: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === key
          ? {
              ...q,
              choices: q.choices.map((c, i) => (i === index ? value : c)),
            }
          : q
      )
    )
  }

  const addChoice = (key: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === key && q.choices.length < 6
          ? { ...q, choices: [...q.choices, ""] }
          : q
      )
    )
  }

  const removeChoice = (key: string, index: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.key !== key || q.choices.length <= 2) return q
        const choices = q.choices.filter((_, i) => i !== index)
        const correct_index =
          q.correct_index === index
            ? 0
            : q.correct_index > index
              ? q.correct_index - 1
              : q.correct_index
        return { ...q, choices, correct_index }
      })
    )
  }

  const moveQuestion = (index: number, direction: -1 | 1) => {
    setQuestions((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }

  const removeQuestion = (key: string) => {
    setQuestions((prev) => prev.filter((q) => q.key !== key))
  }

  const validate = (): string | null => {
    if (!title.trim()) return "請填寫題庫標題"
    if (questions.length === 0) return "至少要有一道題目"
    for (const [i, q] of questions.entries()) {
      if (!q.question_text.trim()) return `第 ${i + 1} 題還沒有題目內容`
      if (q.choices.some((c) => !c.trim())) return `第 ${i + 1} 題有空白的選項`
      if (q.choices.length < 2) return `第 ${i + 1} 題至少要有兩個選項`
    }
    return null
  }

  const handleSubmit = async () => {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }
    setSaving(true)
    try {
      await onSubmit(
        title.trim(),
        questions.map((q) => ({
          question_text: q.question_text.trim(),
          choices: q.choices.map((c) => c.trim()),
          correct_index: q.correct_index,
          time_limit_seconds: q.time_limit_seconds,
        }))
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "儲存失敗")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <Label htmlFor="quiz-title">題庫標題</Label>
        <Input
          id="quiz-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：實驗室冷知識大挑戰"
        />
      </div>

      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={q.key} className="space-y-4 rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">
                第 {i + 1} 題
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === 0}
                  onClick={() => moveQuestion(i, -1)}
                  aria-label="上移"
                >
                  <IconChevronUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === questions.length - 1}
                  onClick={() => moveQuestion(i, 1)}
                  aria-label="下移"
                >
                  <IconChevronDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={questions.length <= 1}
                  onClick={() => removeQuestion(q.key)}
                  aria-label="刪除這題"
                  className="text-destructive hover:text-destructive"
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            </div>

            <Textarea
              value={q.question_text}
              onChange={(e) =>
                updateQuestion(q.key, { question_text: e.target.value })
              }
              placeholder="題目內容"
            />

            <div className="space-y-2">
              {q.choices.map((choice, ci) => (
                <div key={ci} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${q.key}`}
                    checked={q.correct_index === ci}
                    onChange={() =>
                      updateQuestion(q.key, { correct_index: ci })
                    }
                    aria-label={`第 ${ci + 1} 個選項為正確答案`}
                    className="size-4"
                  />
                  <Input
                    value={choice}
                    onChange={(e) => updateChoice(q.key, ci, e.target.value)}
                    placeholder={`選項 ${ci + 1}`}
                    className="flex-1"
                  />
                  {q.choices.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeChoice(q.key, ci)}
                      aria-label="刪除選項"
                    >
                      <IconTrash className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
              {q.choices.length < 6 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addChoice(q.key)}
                >
                  新增選項
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor={`limit-${q.key}`} className="text-sm">
                作答秒數
              </Label>
              <Input
                id={`limit-${q.key}`}
                type="number"
                min={5}
                max={120}
                value={q.time_limit_seconds}
                onChange={(e) =>
                  updateQuestion(q.key, {
                    time_limit_seconds: Number(e.target.value) || 20,
                  })
                }
                className="w-24"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setQuestions((prev) => [...prev, blankQuestion()])}
        >
          新增題目
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "儲存中…" : submitLabel}
        </Button>
      </div>
    </div>
  )
}
