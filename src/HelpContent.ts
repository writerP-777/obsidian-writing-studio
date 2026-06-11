import README from '../README.md';

const start = README.indexOf('\n## Features');
let content = start !== -1 ? README.slice(start).trimStart() : README;

// Cut everything from Installation onward — those sections are written for
// GitHub (relative links, anchors, badges) and break inside Obsidian
const cut = content.search(/\n## (Installation|Requirements|Reporting a Bug|Security)\b/);
if (cut !== -1) content = content.slice(0, cut);

// Drop relative-path images — they cannot resolve inside the app
content = content.replace(/^!\[[^\]]*\]\((?!https?:\/\/)[^)]*\)[ \t]*$/gm, '');

export const HELP_CONTENT = content;
