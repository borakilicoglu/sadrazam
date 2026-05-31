import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://borakilicoglu.github.io",
  base: "/sadrazam",
  integrations: [
    starlight({
      title: "Sadrazam",
      description: "Dependency analysis CLI for JavaScript and TypeScript projects.",
      logo: {
        src: "./public/logo.svg",
      },
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/borakilicoglu/sadrazam",
        },
        {
          icon: "npm",
          label: "npm",
          href: "https://www.npmjs.com/package/sadrazam",
        },
      ],
      sidebar: [
        {
          label: "Guide",
          items: [
            { label: "Overview", slug: "overview" },
            { label: "Getting Started", slug: "getting-started" },
            { label: "CLI Usage", slug: "usage" },
            { label: "Config", slug: "config" },
            { label: "Features", slug: "features" },
            { label: "Findings", slug: "findings" },
            { label: "AI Mode", slug: "ai-mode" },
            { label: "CI & Releases", slug: "ci" },
            { label: "FAQ", slug: "faq" },
          ],
        },
      ],
      editLink: {
        baseUrl: "https://github.com/borakilicoglu/sadrazam/edit/main/docs/",
      },
      disable404Route: true,
      credits: false,
    }),
  ],
});
