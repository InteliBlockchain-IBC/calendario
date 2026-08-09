import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const CONTENT_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params

  // Segunda barreira contra travessia de diretório: o nome é gerado no
  // upload, mas a rota é pública e não pode confiar na URL.
  if (segments.some((s) => s.includes('..') || s.includes('/'))) {
    return NextResponse.json({ message: 'Caminho inválido.' }, { status: 400 })
  }

  const base = path.resolve(process.env.UPLOAD_DIR ?? './uploads')
  const target = path.resolve(base, ...segments)
  if (!target.startsWith(base + path.sep)) {
    return NextResponse.json({ message: 'Caminho inválido.' }, { status: 400 })
  }

  try {
    const file = await readFile(target)
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': CONTENT_TYPE[path.extname(target)] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ message: 'Arquivo não encontrado.' }, { status: 404 })
  }
}
