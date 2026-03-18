import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Sadrazam",
  description: "Dependency analysis CLI for JavaScript and TypeScript projects.",
  base: "/sadrazam/",
  cleanUrls: true,
  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "Sadrazam",
    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "GitHub", link: "https://github.com/borakilicoglu/sadrazam" },
      { text: "npm", link: "https://www.npmjs.com/package/sadrazam" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Overview", link: "/" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "CLI Usage", link: "/usage" },
          { text: "Config", link: "/config" },
          { text: "Features", link: "/features" },
          { text: "Findings", link: "/findings" },
          { text: "AI Mode", link: "/ai-mode" },
          { text: "CI & Releases", link: "/ci" },
          { text: "FAQ", link: "/faq" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/borakilicoglu/sadrazam" },
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Bora Kilicoglu",
    },
  },
});
