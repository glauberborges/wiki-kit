// @ts-check
// {{PROJECT}} wiki — Docusaurus in docs-only mode, with offline local search.
//
// Replace ALL {{...}} placeholders when installing. Forgetting one makes the
// site point at the wrong project.

import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: '{{PROJECT}}',
  tagline: '{{TAGLINE}}',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://{{ORG}}.github.io',
  baseUrl: '/',

  organizationName: '{{ORG}}',
  projectName: '{{REPO}}',

  // A broken link fails the build. That's half the reason CI runs the build.
  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: '{{LOCALE}}',
    locales: ['{{LOCALE}}'],
  },

  markdown: {
    mermaid: true,
  },

  themes: [
    '@docusaurus/theme-mermaid',
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      /** @type {import('@easyops-cn/docusaurus-search-local').PluginOptions} */
      ({
        hashed: true,
        // Local search: the site works offline, no Algolia and no API key.
        language: ['{{SEARCH_LANG}}', 'en'],
        docsRouteBasePath: '/',
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
      }),
    ],
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/', // docs-only mode: the wiki is the whole site
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/{{ORG}}/{{REPO}}/tree/main/wiki/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: '{{PROJECT}}',
        items: [
          {
            href: 'https://github.com/{{ORG}}/{{REPO}}',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        copyright: '{{PROJECT}} — wiki kept in sync with the code in wiki/.',
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['bash', 'json', 'yaml'],
      },
    }),
};

export default config;
