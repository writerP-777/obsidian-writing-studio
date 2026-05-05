import README from '../README.md';

const featuresIndex = README.indexOf('\n## Features');
export const HELP_CONTENT = featuresIndex !== -1 ? README.slice(featuresIndex).trimStart() : README;
