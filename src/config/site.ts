/**
 * Personal site configuration.
 *
 * The site keeps as-folio's content-first structure, but shifts the tone from a
 * formal academic page to a lighter blog, projects, and research notebook.
 */

export type NavLeaf = { label: string; href: string };
export type NavDropdown = { label: string; children: NavLeaf[] };
export type NavItem = NavLeaf | NavDropdown;

export const site = {
  title: "LuNa's Notes",
  description:
    'A personal site for blogs, projects, and research notes around multi-agent systems.',
  url: (import.meta.env.SITE ?? 'https://luna-shi.github.io').replace(/\/$/, ''),
  base: import.meta.env.BASE_URL === '/' ? '' : (import.meta.env.BASE_URL ?? '').replace(/\/$/, ''),
  lang: 'en',

  author: {
    name: 'WenXiang Shi',
    email: '',
    avatar: '/assets/img/avatar.webp',
    subtitle: `Multi-agent systems &nbsp;·&nbsp; agent swarms &nbsp;·&nbsp; public notes`,
    moreInfo: `<p>Dequan Wang Lab / Shanghai</p>`,
  },

  socials: {
    email: undefined as string | undefined,
    x_username: undefined as string | undefined,
    linkedin_username: undefined as string | undefined,
    github_username: 'LuNa-shi',
    gitlab_username: undefined as string | undefined,
    scholar_userid: undefined as string | undefined,
    orcid_id: undefined as string | undefined,
    inspire_id: undefined as string | undefined,
    researchgate_username: undefined as string | undefined,
    arxiv_id: undefined as string | undefined,
    youtube_id: undefined as string | undefined,
    instagram_username: undefined as string | undefined,
    mastodon_url: undefined as string | undefined,
    bluesky_handle: undefined as string | undefined,
    medium_username: undefined as string | undefined,
    cv_pdf: undefined as string | undefined,
    rss_icon: true,
  },

  navbar: {
    fixed: true,
    socialIcons: false,
    items: [
      { label: 'about', href: '/' },
      { label: 'blog', href: '/blog/' },
      { label: 'projects', href: '/projects/' },
      { label: 'research', href: '/research/' },
    ] as NavItem[],
  },

  footer: {
    text: `Powered by <a href="https://github.com/dadangnh/as-folio" target="_blank" rel="noopener noreferrer">as-folio</a>.
      Built with Astro and a growing pile of notes.`,
    lastUpdated: false,
    impressum: undefined as string | undefined,
    position: 'normal' as 'sticky' | 'normal' | 'hidden',
  },

  cv: {
    format: 'rendercv' as 'rendercv' | 'jsonresume',
    pdfPath: '' as string,
  },

  blog: {
    name: 'blog',
    description: 'Small notes make unfinished thought durable.',
    postsPerPage: 8,
    displayTags: ['pi-agent', 'sutton-rl', 'cs336'],
    displayCategories: ['agents', 'learning', 'reading'],
    externalSources: [] as Array<{
      name: string;
      rssUrl?: string;
      posts?: Array<{ url: string; publishedDate: string }>;
      categories?: string[];
      tags?: string[];
    }>,
    wordsPerMinute: 220 as number,
    emptyMessage: 'No posts yet. The notebook is warming up.',
  },

  announcements: {
    enabled: true,
    scrollable: false,
    limit: 4 as number | undefined,
  },

  latestPosts: {
    enabled: true,
    scrollable: false,
    limit: 4 as number | undefined,
  },

  selectedPapers: {
    enabled: false,
  },

  features: {
    darkmode: false,
    search: true,
    progressBar: true,
    backToTop: true,
    masonry: true,
    mediumZoom: true,
    tooltips: false,
    cookieConsent: false,
    newsletter: false,
    videoEmbedding: false,
    viewTransitions: true,
    socialShare: true,
  },

  giscus: {
    enabled: false,
    lazyLoad: true,
    repo: '' as `${string}/${string}`,
    repoId: '',
    category: 'Comments',
    categoryId: '',
    mapping: 'title' as 'pathname' | 'url' | 'title' | 'og:title',
    strict: true,
    reactionsEnabled: true,
    inputPosition: 'bottom' as 'top' | 'bottom',
    darkTheme: 'light',
    lightTheme: 'light',
    lang: 'en',
  },

  analytics: {
    ga4: '' as string,
    cronitor: '' as string,
    pirsch: '' as string,
    openpanel: '' as string,
    googleVerification: '' as string,
    bingVerification: '' as string,
  },

  og: {
    enabled: true,
    image: '/assets/img/avatar-og.jpg' as string,
  },

  newsletter: {
    endpoint: '' as string,
  },

  teaching: {
    calendarId: '' as string,
    timezone: 'Asia/Shanghai' as string,
  },

  publications: {
    badges: {
      altmetric: false,
      dimensions: false,
      googleScholar: false,
      inspirehep: false,
    },
    maxAuthorLimit: 8 as number | undefined,
    thumbnails: true,
    authorLastName: 'Shi' as string | undefined,
    previewDir: '/assets/img/publication_preview/',
    pdfDir: '/assets/pdf/',
    labels: {
      abstract: 'Abs',
      bibtex: 'Bib',
      supp: 'Supp',
      searchPlaceholder: 'Search records...',
      noResults: 'Nothing is listed here yet. Research notes live in the blog.',
    },
  },

  repositories: {
    githubUsers: true,
    githubRepos: true,
    trophies: false,
    themeLight: 'default' as string,
    themeDark: 'default' as string,
    trophyThemeLight: 'flat' as string,
    trophyThemeDark: 'flat' as string,
  },

  comments: {
    disqusShortname: '' as string,
  },

  pages: {
    projects: {
      description:
        'Selected projects, led by multi-agent systems work and followed by pinned embodied-AI repositories.',
    },
    teaching: {
      description: 'Archived course notes and materials, if they become useful to publish.',
    },
  },

  theme: {
    default: 'light' as 'light' | 'dark' | 'system',
    color: {
      light: '#0f766e' as string,
      dark: '#0f766e' as string,
    },
  },
} as const;

export type SiteConfig = typeof site;
