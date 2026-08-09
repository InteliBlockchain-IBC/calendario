import { NextResponse } from 'next/server'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { runSync } from '@/lib/sync/run-sync'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const { calendar } = await requireCalendarAdmin(slug)

  try {
    // Botão do admin faz varredura COMPLETA: é o modo que reconcilia
    // ausências e corrige um evento movido para fora da janela (§6.4).
    const counts = await runSync(calendar.id, 'full')
    return NextResponse.json({
      message: `${counts.created} novos, ${counts.updated} atualizados, ${counts.cancelled} cancelados.`,
      counts,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.'
    return NextResponse.json({ message: `Falha ao sincronizar: ${message}` }, { status: 500 })
  }
}
