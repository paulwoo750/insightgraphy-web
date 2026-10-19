import { NextRequest, NextResponse } from 'next/server'

const productionAdminHost = process.env.ADMIN_HOSTNAME || 'admin.insightgraphy.org'
const adminShortRoutes = new Set([
  'hub',
  'access',
  'about',
  'absence',
  'activities',
  'archive',
  'dashboard',
  'fine',
  'join',
  'landing',
  'members',
  'records',
  'reset',
  'rules',
  'rules-doc',
  'schedule',
  'semesters',
  'showcase',
  'vote',
])

export function proxy(request: NextRequest) {
  const hostname = (request.headers.get('host') || '').split(':')[0].toLowerCase()
  const isAdminHost = hostname === productionAdminHost || hostname === 'admin.localhost'
  if (!isAdminHost) return NextResponse.next()

  const url = request.nextUrl.clone()
  const pathname = url.pathname

  if (pathname === '/') {
    url.pathname = '/admin'
    return NextResponse.rewrite(url)
  }

  if (pathname === '/hub' || pathname.startsWith('/hub/')) {
    url.pathname = `/admin${pathname}`
    return NextResponse.rewrite(url)
  }

  const firstSegment = pathname.split('/').filter(Boolean)[0]
  if (firstSegment && adminShortRoutes.has(firstSegment) && !pathname.startsWith('/admin/')) {
    url.pathname = `/admin/hub${pathname}`
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
