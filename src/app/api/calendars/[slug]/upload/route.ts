import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { MAX_UPLOAD_BYTES, ALLOWED_IMAGE_TYPES } from '@/lib/sync/constants'

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { calendar } = await requireCalendarAdmin(slug)

  const form = await request.formData()
  const file = form.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'Nenhum arquivo enviado.' }, { status: 400 })
  }
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { message: 'Formato não aceito. Use JPG, PNG ou WebP.' },
      { status: 400 },
    )
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ message: 'Arquivo maior que 5 MB.' }, { status: 400 })
  }

  // Nome sempre gerado. Usar o nome enviado pelo cliente permitiria
  // travessia de diretório e sobrescrita de arquivo alheio.
  const filename = `${randomUUID()}.${EXTENSION[file.type]}`
  const dir = path.join(process.env.UPLOAD_DIR ?? './uploads', calendar.id)

  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()))

  return NextResponse.json({ url: `/api/uploads/${calendar.id}/${filename}` })
}
