import { type LocaleCode, type NavItem, site } from '@config/site';

export type Locale = LocaleCode;

export const defaultLocale = site.i18n.defaultLocale;
export const supportedLocales = site.i18n.locales.map((locale) => locale.code);

export function isLocale(value: string | undefined): value is Locale {
  return value === 'en' || value === 'zh';
}

function stripBase(pathname: string): string {
  const base = site.base;
  if (!base) return pathname || '/';
  if (pathname === base) return '/';
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length) || '/';
  return pathname || '/';
}

export function stripLocale(pathname: string): string {
  const path = stripBase(pathname);
  if (path === '/zh') return '/';
  if (path.startsWith('/zh/')) return path.slice('/zh'.length) || '/';
  return path || '/';
}

export function getLocaleFromPath(pathname: string): Locale {
  const path = stripBase(pathname);
  return path === '/zh' || path.startsWith('/zh/') ? 'zh' : defaultLocale;
}

export function labelsFor(locale: Locale) {
  return site.i18n.labels[locale] ?? site.i18n.labels[defaultLocale];
}

export function localeMeta(locale: Locale) {
  return site.i18n.locales.find((item) => item.code === locale) ?? site.i18n.locales[0];
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'zh' ? 'en' : 'zh';
}

export function localizedPath(path: string, locale: Locale): string {
  const bare = path.startsWith('/') ? path : `/${path}`;
  const unlocalized = stripLocale(bare);
  const localized = locale === 'zh' ? `/zh${unlocalized === '/' ? '/' : unlocalized}` : unlocalized;
  return `${site.base}${localized}` || '/';
}

export function localizedCurrentPath(pathname: string, locale: Locale): string {
  return localizedPath(stripLocale(pathname), locale);
}

export function localizedNavItems(locale: Locale): NavItem[] {
  const labels = labelsFor(locale).nav;
  return site.navbar.items.map((item) => {
    if ('href' in item) {
      return {
        ...item,
        label: labels[item.href as keyof typeof labels] ?? item.label,
        href: localizedPath(item.href, locale).replace(site.base, '') || '/',
      };
    }
    return {
      ...item,
      label: item.label,
      children: item.children.map((child) => ({
        ...child,
        label: labels[child.href as keyof typeof labels] ?? child.label,
        href: localizedPath(child.href, locale).replace(site.base, '') || '/',
      })),
    };
  });
}

export function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

export function formatDate(
  date: Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string {
  return date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', options);
}

export function collectionLocale(entry: { data: { lang?: string; language?: string } }): Locale {
  const raw = entry.data.lang ?? entry.data.language;
  return raw === 'zh' || raw === 'zh-CN' || raw === 'cn' ? 'zh' : 'en';
}

export function isEntryInLocale(
  entry: { data: { lang?: string; language?: string } },
  locale: Locale,
): boolean {
  return collectionLocale(entry) === locale;
}

export function contentSlug(entry: {
  id: string;
  data: { title?: string; canonicalSlug?: string; translationKey?: string };
}): string {
  if (entry.data.canonicalSlug) return entry.data.canonicalSlug;
  if (entry.data.translationKey) return entry.data.translationKey;

  const titleSlug = slugifyTitle(entry.data.title ?? '');
  if (titleSlug && /[a-z]/.test(titleSlug)) return titleSlug;

  return legacyContentSlug(entry);
}

export function legacyContentSlug(entry: { id: string }): string {
  return entry.id.replace(/-zh$/, '');
}

export function slugifyTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .toLowerCase();
}

export function contentHref(collection: 'blog' | 'projects', slug: string, locale: Locale): string {
  return localizedPath(`/${collection}/${slug}/`, locale);
}

export function taxonomyLabel(
  category: string,
  labels: Record<string, string> | undefined,
): string {
  return labels?.[category] ?? category;
}
