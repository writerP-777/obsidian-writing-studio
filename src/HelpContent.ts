import README from '../README.md';

// The in-app help is the README from "Features" on, minus what only makes
// sense on GitHub. Pure so the real README can be run through it in tests.
export function stripForHelp(readme: string): string {
  const start = readme.indexOf('\n## Features');
  let content = start !== -1 ? readme.slice(start).trimStart() : readme;

  // Cut everything from Installation onward — those sections are written for
  // GitHub (relative links, anchors, badges) and break inside Obsidian
  const cut = content.search(/\n## (Installation|Requirements|Reporting a Bug|Security)\b/);
  if (cut !== -1) content = content.slice(0, cut);

  // Drop relative-path images — they cannot resolve inside the app. The README
  // carries them two ways: Markdown images, and centered HTML figures
  // (<p align="center"><img src="assets/…"> … <em>caption</em></p>).
  content = content.replace(/^!\[[^\]]*\]\((?!https?:\/\/)[^)]*\)[ \t]*$/gm, '');
  content = content.replace(/^<p align="center">\s*<img src="assets\/[\s\S]*?<\/p>[ \t]*\n?/gm, '');

  return content;
}

export const HELP_CONTENT = stripForHelp(README);
