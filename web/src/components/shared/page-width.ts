/**
 * The content width for a route — used by BOTH the header and the page, so the logo and
 * nav always line up with the content below them. They used to be set separately: the
 * header was fixed at 1180px while Studio's page grew to 1600px, so on a large screen
 * the header sat indented from everything under it.
 *
 * Studio is a canvas plus a tool drawer and gets the room; every other page keeps the
 * reading width.
 */
export function pageWidthClass(pathname: string): string {
  return pathname.startsWith('/studio') ? 'max-w-[1600px]' : 'max-w-[1180px]'
}
