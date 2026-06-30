/**
 * Personal site configuration.
 *
 * The site keeps as-folio's content-first structure, but shifts the tone from a
 * formal academic page to a lighter blog, projects, and research notebook.
 */

export type NavLeaf = { label: string; href: string };
export type NavDropdown = { label: string; children: NavLeaf[] };
export type NavItem = NavLeaf | NavDropdown;
export type LocaleCode = 'en' | 'zh';

export const site = {
  title: "luna's Notes",
  description:
    'A personal site for blogs, projects, and research notes around multi-agent systems.',
  url: (import.meta.env.SITE ?? 'https://luna-shi.github.io').replace(/\/$/, ''),
  base: import.meta.env.BASE_URL === '/' ? '' : (import.meta.env.BASE_URL ?? '').replace(/\/$/, ''),
  lang: 'en',

  /**
   * Bilingual site settings. English keeps the historical root URLs, while
   * Chinese pages are generated under `/zh/`.
   */
  i18n: {
    enabled: true,
    defaultLocale: 'en' as LocaleCode,
    locales: [
      { code: 'en' as LocaleCode, label: 'EN', name: 'English', prefix: '' },
      { code: 'zh' as LocaleCode, label: '中', name: '中文', prefix: '/zh' },
    ],
    labels: {
      en: {
        siteDescription:
          'A personal site for blogs, projects, and research notes around multi-agent systems.',
        nav: {
          '/': 'About',
          '/blog/': 'Blog',
          '/projects/': 'Projects',
          '/research/': 'Research',
        },
        language: {
          switchTo: '切换到中文',
          current: 'English',
        },
        base: {
          skipToContent: 'Skip to main content',
          backToTop: 'Back to top',
          toggleNavigation: 'Toggle navigation',
        },
        search: {
          label: 'Search',
          placeholder: 'Search or jump to…',
          pill: 'Search…',
          navigation: 'Navigation',
          blogPosts: 'Blog Posts',
          projects: 'Projects',
          results: 'Search Results',
          publications: 'Search publications',
        },
        home: {
          heroEyebrow: 'Research notebook',
          heroHeadline: 'Public notes on multi-agent systems.',
          readNotes: 'Read the notes',
          seeProjects: 'See projects',
          news: 'News',
          allNews: 'All news',
          latestWriting: 'Latest writing',
          allPosts: 'All posts',
          selectedPublications: 'Selected publications',
          fullList: 'Full list',
        },
        blog: {
          name: 'Blog',
          description: 'Small notes make unfinished thought durable.',
          filtersLabel: 'Blog filters',
          emptyMessage: 'No posts yet. The notebook is warming up.',
          allPosts: 'All posts',
          allTags: 'all tags',
          backToBlog: 'Back to blog',
          minRead: 'min read',
          updated: 'Updated',
          copyCode: 'Copy code',
          copy: 'copy',
          copied: 'copied!',
          tagsTitle: 'tags',
          tagsPageTitle: 'Tags',
          tagsDescription: "All post tags on WenXiang Shi's blog",
          tagCloud: 'Tag cloud',
          noTags: 'No tags yet.',
          noPostsForTag: 'No posts found for this tag.',
          noPostsForCategory: 'No posts found for this category.',
          category: 'Category:',
          postsTagged: 'Posts tagged',
          pageTitle: 'Blog — Page {page}',
          categoryTitle: 'Category: {category}',
          categoryPageTitle: 'Category: {category} — Page {page}',
          categoryDescription: 'Posts in category "{category}"',
          categoryPageDescription: 'Posts in category "{category}", page {page}',
          tagTitle: 'Tag: {tag}',
          tagPageTitle: 'Tag: {tag} — Page {page}',
          tagDescription: 'Posts tagged "{tag}"',
          tagPageDescription: 'Posts tagged "{tag}", page {page}',
          yearTitle: 'Blog — {year}',
          yearPageTitle: 'Blog — {year} — Page {page}',
          yearDescription: 'All posts from {year}',
          yearPageDescription: 'Posts from {year}, page {page}',
          relatedTitle: 'Enjoy Reading This Article?',
          relatedSubtitle: 'Here are some more articles you might like to read next:',
          breadcrumb: 'Blog',
        },
        projects: {
          title: 'Projects',
          description:
            'Selected projects, led by multi-agent systems work and followed by pinned embodied-AI repositories.',
          byline: 'Projects by WenXiang Shi',
          noProjects: 'No projects yet.',
          breadcrumb: 'Projects',
          website: 'Website',
          references: 'References',
          codeRepository: 'Code Repository',
          githubStars: 'GitHub Stars',
          categories: {
            'agent-systems': 'agent-systems',
            'embodied-ai': 'embodied-ai',
          },
        },
        research: {
          title: 'Research',
          description: 'Research interests by WenXiang Shi',
          heading: 'Research interests',
          intro: 'A compact map of the questions I want this site to signal first.',
          sections: [
            {
              title: 'Multi-agent systems and agent swarms',
              body: 'My main interest is how multiple agents can divide work, preserve useful context, produce inspectable artifacts, and make progress without turning coordination into noise. I care especially about formats for roles, traces, handoffs, evaluations, and shared state.',
            },
            {
              title: 'Agent-system format and verification',
              body: 'A strong model is only one component of an agent system. I am drawn to the runtime layer: assignment manifests, execution boundaries, context pieces, judges, metrics, and failure attribution. The goal is to make long agent workflows easier to reproduce and debug.',
            },
            {
              title: 'Scientific swarms',
              body: "In Prof. Dequan Wang's lab, I am thinking about agentic harnesses for research work: systems that can run experiments, compare evidence, and leave enough trace for a human to audit what happened. More lab context is available at",
              linkText: 'dequan.wang',
            },
            {
              title: 'Embodied agents as prior work',
              body: 'My earlier work around visual language navigation and embodied AI still shapes how I think about agents: they need local memory, task decomposition, changing observations, and evaluation that matches the actual environment. I now treat that experience as one source of design pressure for broader multi-agent systems.',
            },
          ],
        },
        news: {
          title: 'News',
          description: 'News and announcements from WenXiang Shi',
          heading: 'news',
          empty: 'No announcements yet.',
        },
        publications: {
          title: 'Records',
          heading: 'records',
          description: 'Records by WenXiang Shi',
          breadcrumb: 'Publications',
          abstract: 'Abstract',
          citation: 'Citation',
          supp: 'Supp',
          slides: 'Slides',
          poster: 'Poster',
          video: 'Video',
          code: 'Code',
          blog: 'Blog',
          website: 'Website',
          details: 'Details',
          awarded: 'Awarded',
          showing: 'Showing {shown} of {total} publication{plural}',
          moreAuthors: 'and {count} more author{plural}',
        },
        share: {
          label: 'Share',
          on: 'Share on {name}',
          device: 'Share via device',
          email: 'Email',
        },
        newsletter: {
          title: 'Subscribe to updates',
          description: 'Get notified about new posts and announcements.',
          emailPlaceholder: 'Email address',
          submit: 'Subscribe',
        },
        footer: {
          text: `Powered by <a href="https://github.com/dadangnh/as-folio" target="_blank" rel="noopener noreferrer">as-folio</a>.
      Built with Astro and a growing pile of notes.`,
          lastUpdated: 'Last updated',
          legalNotice: 'Legal Notice',
        },
        cookies: {
          title: 'We use cookies',
          description: 'This site uses cookies to improve your experience and analyze traffic.',
          acceptAll: 'Accept all',
          rejectAll: 'Reject all',
          manage: 'Manage preferences',
          save: 'Save preferences',
          preferencesTitle: 'Cookie preferences',
          necessaryTitle: 'Necessary cookies',
          necessaryDescription: 'Required for the site to function.',
          analyticsTitle: 'Analytics cookies',
          analyticsDescription: 'Help us understand how visitors interact with the site.',
        },
        notFound: {
          title: '404 — Page Not Found',
          heading: 'Page not found',
          body: "The page you were looking for doesn't exist or has been moved.",
          home: 'Go back home',
        },
        pagination: {
          label: 'Pagination',
          previous: 'Previous page',
          next: 'Next page',
          page: 'Page {page}',
        },
      },
      zh: {
        siteDescription: '关于多智能体系统、项目和研究笔记的个人站点。',
        nav: {
          '/': '关于',
          '/blog/': '博客',
          '/projects/': '项目',
          '/research/': '研究',
        },
        language: {
          switchTo: 'Switch to English',
          current: '中文',
        },
        base: {
          skipToContent: '跳到正文',
          backToTop: '回到顶部',
          toggleNavigation: '展开或收起导航',
        },
        search: {
          label: '搜索',
          placeholder: '搜索或跳转到…',
          pill: '搜索…',
          navigation: '导航',
          blogPosts: '博客文章',
          projects: '项目',
          results: '搜索结果',
          publications: '搜索记录',
        },
        home: {
          heroEyebrow: '研究笔记',
          heroHeadline: '关于多智能体系统的公开笔记。',
          readNotes: '阅读笔记',
          seeProjects: '查看项目',
          news: '动态',
          allNews: '全部动态',
          latestWriting: '最新文章',
          allPosts: '全部文章',
          selectedPublications: '代表性成果',
          fullList: '完整列表',
        },
        blog: {
          name: '博客',
          description: '把还没完成的想法写下来，它们才会留下痕迹。',
          filtersLabel: '博客筛选',
          emptyMessage: '暂时还没有文章。',
          allPosts: '全部文章',
          allTags: '全部标签',
          backToBlog: '返回博客',
          minRead: '分钟阅读',
          updated: '更新于',
          copyCode: '复制代码',
          copy: '复制',
          copied: '已复制！',
          tagsTitle: '标签',
          tagsPageTitle: '标签',
          tagsDescription: '师文翔博客里的全部标签',
          tagCloud: '标签云',
          noTags: '暂时还没有标签。',
          noPostsForTag: '这个标签下暂时没有文章。',
          noPostsForCategory: '这个分类下暂时没有文章。',
          category: '分类：',
          postsTagged: '标签文章',
          pageTitle: '博客 — 第 {page} 页',
          categoryTitle: '分类：{category}',
          categoryPageTitle: '分类：{category} — 第 {page} 页',
          categoryDescription: '分类“{category}”下的文章',
          categoryPageDescription: '分类“{category}”下的文章，第 {page} 页',
          tagTitle: '标签：{tag}',
          tagPageTitle: '标签：{tag} — 第 {page} 页',
          tagDescription: '带有“{tag}”标签的文章',
          tagPageDescription: '带有“{tag}”标签的文章，第 {page} 页',
          yearTitle: '博客 — {year}',
          yearPageTitle: '博客 — {year} — 第 {page} 页',
          yearDescription: '{year} 年的全部文章',
          yearPageDescription: '{year} 年的文章，第 {page} 页',
          relatedTitle: '还想继续读吗？',
          relatedSubtitle: '下面这些文章也许适合接着看：',
          breadcrumb: '博客',
        },
        projects: {
          title: '项目',
          description: '以多智能体系统为主线，同时保留一些具身智能项目作为背景。',
          byline: '师文翔的项目',
          noProjects: '暂时还没有项目。',
          breadcrumb: '项目',
          website: '网站',
          references: '参考资料',
          codeRepository: '代码仓库',
          githubStars: 'GitHub Stars',
          categories: {
            'agent-systems': '智能体系统',
            'embodied-ai': '具身智能',
          },
        },
        research: {
          title: '研究',
          description: '师文翔的研究兴趣',
          heading: '研究兴趣',
          intro: '这是一张很短的地图，说明我希望这个站点首先传达哪些问题。',
          sections: [
            {
              title: '多智能体系统与智能体群体',
              body: '我主要关心多个智能体如何分工、保留有用上下文、产出可检查的产物，并在不让协调本身变成噪声的情况下持续推进任务。我尤其关注角色、轨迹、交接、评测和共享状态应该如何被格式化。',
            },
            {
              title: '智能体系统格式与验证',
              body: '强模型只是智能体系统的一部分。我更感兴趣的是运行时层：任务清单、执行边界、上下文片段、裁判、指标和失败归因。目标是让长链路智能体工作流更容易复现、检查和调试。',
            },
            {
              title: '面向科研的智能体群体',
              body: '在王德泉老师的实验室里，我在思考用于科研工作的 agentic harness：系统能跑实验、比较证据，并留下足够的轨迹，让人类可以审计发生了什么。更多实验室信息见',
              linkText: 'dequan.wang',
            },
            {
              title: '具身智能作为早期背景',
              body: '我之前围绕视觉语言导航和具身智能做过一些工作，这仍然影响我理解智能体的方式：它们需要局部记忆、任务分解、不断变化的观测，以及真正贴合环境的评测。现在我把这段经验看作设计更广义多智能体系统时的一种压力来源。',
            },
          ],
        },
        news: {
          title: '动态',
          description: '师文翔的动态与公告',
          heading: '动态',
          empty: '暂时还没有动态。',
        },
        publications: {
          title: '记录',
          heading: '记录',
          description: '师文翔的记录',
          breadcrumb: '成果',
          abstract: '摘要',
          citation: '引用',
          supp: '补充材料',
          slides: '幻灯片',
          poster: '海报',
          video: '视频',
          code: '代码',
          blog: '博客',
          website: '网站',
          details: '详情',
          awarded: '获奖',
          showing: '显示 {shown} / {total} 条记录',
          moreAuthors: '等 {count} 位作者',
        },
        share: {
          label: '分享',
          on: '分享到 {name}',
          device: '用系统分享',
          email: '邮件',
        },
        newsletter: {
          title: '订阅更新',
          description: '有新文章或新动态时收到通知。',
          emailPlaceholder: '邮箱地址',
          submit: '订阅',
        },
        footer: {
          text: `由 <a href="https://github.com/dadangnh/as-folio" target="_blank" rel="noopener noreferrer">as-folio</a> 驱动。
      使用 Astro 构建，也靠一堆持续生长的笔记支撑。`,
          lastUpdated: '最后更新',
          legalNotice: '法律声明',
        },
        cookies: {
          title: '本站使用 Cookie',
          description: '本站使用 Cookie 改善体验并分析访问情况。',
          acceptAll: '全部接受',
          rejectAll: '全部拒绝',
          manage: '管理偏好',
          save: '保存偏好',
          preferencesTitle: 'Cookie 偏好',
          necessaryTitle: '必要 Cookie',
          necessaryDescription: '网站正常运行所必需。',
          analyticsTitle: '分析 Cookie',
          analyticsDescription: '帮助我们了解访客如何使用本站。',
        },
        notFound: {
          title: '404 — 页面不存在',
          heading: '页面不存在',
          body: '你访问的页面不存在，或者已经被移动。',
          home: '回到首页',
        },
        pagination: {
          label: '分页',
          previous: '上一页',
          next: '下一页',
          page: '第 {page} 页',
        },
      },
    },
  },

  author: {
    name: 'WenXiang Shi',
    email: '',
    avatar: '/assets/img/avatar.webp',
    subtitle: `Multi-agent systems &nbsp;·&nbsp; agent swarms &nbsp;·&nbsp; public notes`,
    moreInfo: `<p>Dequan Wang Lab / Shanghai</p>`,
  },

  /**
   * Homepage hero. All editorial copy lives here (never hardcoded in
   * components) so it stays a single, easy edit.
   */
  home: {
    hero: {
      enabled: true,
      /** Small kicker above the headline (topic or genre, not the affiliation
          — affiliation already shows under your name in the hero). */
      eyebrow: 'Research notebook',
      /** Large display statement — set the tone of the whole site. Keep short. */
      headline: 'Public notes on multi-agent systems.',
      /** Optional one-line lead under the headline (blank = use about.mdx only). */
      lead: '',
      /** Show the avatar + social row in the hero. */
      showProfile: true,
    },
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
      { label: 'About', href: '/' },
      { label: 'Blog', href: '/blog/' },
      { label: 'Projects', href: '/projects/' },
      { label: 'Research', href: '/research/' },
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
    name: 'Blog',
    description: 'Small notes make unfinished thought durable.',
    postsPerPage: 8,
    displayTags: ['codex-source-dive', 'crafting-interpreters', 'sutton-rl', 'cs336', 'pi-agent'],
    displayCategories: ['agents', 'systems', 'learning', 'reading', 'research'],
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
    /**
     * Legacy single-accent override. Set to 'auto' so the accent is driven by
     * the editorial variant system (_design.css) instead of one fixed colour.
     */
    color: {
      light: 'auto' as string,
      dark: 'auto' as string,
    },
    /**
     * Editorial design variant — the committed default personality:
     *   'clay'  warm ivory + clay, serif-forward (Anthropic-faithful)
     *   'slate' cool, minimal, sans-forward (product-page feel)
     *   'ink'   dark editorial, glowing clay (frontier mode)
     */
    variant: 'slate' as 'clay' | 'slate' | 'ink',
    /**
     * Show the floating variant switcher for live preview. Set to false before
     * shipping to lock the site to `variant` above.
     */
    previewVariants: false as boolean,
  },
} as const;

export type SiteConfig = typeof site;
