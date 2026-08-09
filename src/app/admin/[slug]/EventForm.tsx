'use client'

import { useState } from 'react'
import { createEvent } from './actions'

export function EventForm({
  slug,
  contactEmails,
}: {
  slug: string
  contactEmails: string[]
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border px-4 py-2">
        Criar evento
      </button>
    )
  }

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    setError(null)
    try {
      const allDay = formData.get('allDay') === 'on'
      await createEvent(
        slug,
        {
          title: String(formData.get('title')),
          description: (formData.get('description') as string) || null,
          startsAt: new Date(String(formData.get('startsAt'))),
          endsAt: new Date(String(formData.get('endsAt'))),
          allDay,
          location: (formData.get('location') as string) || null,
          attendeeEmails: String(formData.get('attendees') ?? '')
            .split(/[,\s]+/)
            .map((e) => e.trim())
            .filter(Boolean),
        },
        formData.get('notify') === 'on',
      )
      setOpen(false)
    } catch (e) {
      // O evento não foi criado em lugar nenhum: se o Google falha, a action
      // lança antes de gravar no banco (§6.1).
      setError(e instanceof Error ? e.message : 'Falha ao criar o evento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-3 rounded-xl border p-4">
      <input name="title" required placeholder="Título" className="w-full rounded border p-2" />
      <div className="flex gap-3">
        <input
          name="startsAt"
          type="datetime-local"
          required
          className="flex-1 rounded border p-2"
        />
        <input
          name="endsAt"
          type="datetime-local"
          required
          className="flex-1 rounded border p-2"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input name="allDay" type="checkbox" /> Dia inteiro
      </label>
      <input name="location" placeholder="Local" className="w-full rounded border p-2" />
      <textarea
        name="description"
        placeholder="Descrição (vai para o Google)"
        className="w-full rounded border p-2"
      />
      <div>
        <input
          name="attendees"
          list="contatos"
          placeholder="Convidados: e-mails separados por vírgula"
          className="w-full rounded border p-2"
        />
        <datalist id="contatos">
          {contactEmails.map((email) => (
            <option key={email} value={email} />
          ))}
        </datalist>
      </div>
      {/* Ligado por padrão ao CRIAR: criar sem avisar torna o convite
          inútil. Ao editar, o padrão é desligado (§6.7). */}
      <label className="flex items-center gap-2 text-sm">
        <input name="notify" type="checkbox" defaultChecked /> Notificar convidados por e-mail
      </label>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Criar'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2">
          Cancelar
        </button>
      </div>
    </form>
  )
}
