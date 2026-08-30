import { binaryCandidates, ExportEngine, ExportOptions, WELL_KNOWN_BIN_DIRS } from '../src/ExportEngine';
import { InMemoryVaultFiles } from './inMemoryVaultFiles';

// The exec seam: a command "exists" when listed here; everything else fails
// like a spawn ENOENT. Every invocation is recorded so tests can assert the
// probe-validated command is the one actually invoked (#344).
const mockExec = {
  existing: new Set<string>(),
  calls: [] as { cmd: string; args: readonly string[] }[],
};

jest.mock('child_process', () => ({
  execFile: (
    cmd: string,
    args: readonly string[],
    cb: (err: Error | null, out?: { stdout: string; stderr: string }) => void,
  ): void => {
    mockExec.calls.push({ cmd, args });
    if (mockExec.existing.has(cmd)) {
      cb(null, { stdout: 'ok', stderr: '' });
    } else {
      cb(new Error(`spawn ${cmd} ENOENT`));
    }
  },
}));

beforeEach(() => {
  mockExec.existing.clear();
  mockExec.calls.length = 0;
});

function makeEngine(settings: Record<string, unknown> = {}) {
  const files = new InMemoryVaultFiles();
  files.files.set('Doc.md', 'Body text.');
  const plugin = {
    app: {
      vault: { getAbstractFileByPath: () => null },
      metadataCache: { getFileCache: () => null },
    },
    projectManager: { getActiveProject: () => null },
    settings: { pandocPath: 'pandoc', pdfEngine: 'auto', pdfEnginePath: '', ...settings },
  };
  return { engine: new ExportEngine(plugin as never, files), files };
}

function pdfOpts(): ExportOptions {
  return {
    format: 'pdf',
    scope: 'current',
    currentFile: 'Doc.md',
    exportTitle: 'Doc',
    includeFrontmatter: false,
    includeTitlesAsHeadings: false,
    paperSize: 'letter',
    font: '',
    fontSize: 12,
    addTitlePage: false,
  };
}

type Located = Record<string, string | null>;
const locate = (engine: ExportEngine): Promise<Located> =>
  (engine as unknown as { locatePdfEngines(): Promise<Located> }).locatePdfEngines();

describe('binaryCandidates (#344)', () => {
  it('orders candidates PATH-first then well-known dirs when no location is configured', () => {
    expect(binaryCandidates('xelatex', '', false)).toEqual([
      'xelatex',
      '/Library/TeX/texbin/xelatex',
      '/opt/homebrew/bin/xelatex',
      '/usr/local/bin/xelatex',
    ]);
  });

  it('searches a configured directory before PATH and well-known dirs', () => {
    const c = binaryCandidates('xelatex', '/opt/tex/bin', false);
    expect(c[0]).toBe('/opt/tex/bin/xelatex');
    expect(c.indexOf('/opt/tex/bin/xelatex')).toBeLessThan(c.indexOf('xelatex'));
    expect(c.indexOf('xelatex')).toBeLessThan(c.indexOf(WELL_KNOWN_BIN_DIRS[0] + '/xelatex'));
  });

  it('adds an .exe variant for a configured directory on Windows, keeping its separator style', () => {
    const c = binaryCandidates('xelatex', 'C:\\texlive\\bin', true);
    expect(c[0]).toBe('C:\\texlive\\bin\\xelatex');
    expect(c[1]).toBe('C:\\texlive\\bin\\xelatex.exe');
    // Well-known dirs are unix-only locations — no .exe variants for them.
    expect(c).not.toContain('/Library/TeX/texbin/xelatex.exe');
  });

  it('trims trailing separators from a configured directory', () => {
    expect(binaryCandidates('pdflatex', '/opt/tex/bin/', false)[0]).toBe('/opt/tex/bin/pdflatex');
  });

  it('uses a configured binary path exactly when its base name is the engine', () => {
    expect(binaryCandidates('xelatex', '/Library/TeX/texbin/xelatex', false)[0])
      .toBe('/Library/TeX/texbin/xelatex');
    expect(binaryCandidates('xelatex', 'C:\\tex\\XeLaTeX.exe', true)[0]).toBe('C:\\tex\\XeLaTeX.exe');
  });

  it('gives a configured binary of a different engine no candidate — never invoked as a guess', () => {
    const c = binaryCandidates('xelatex', '/opt/tex/bin/pdflatex', false);
    expect(c[0]).toBe('xelatex');
    expect(c.some(cand => cand.includes('pdflatex'))).toBe(false);
  });

  it('treats an unrecognized base name as a directory to search', () => {
    // The reporter's literal value: /Library/TeX/texbin/latex is not one of the
    // four engines, so it is searched as a directory (finding nothing) while
    // PATH and well-known dirs still apply.
    const c = binaryCandidates('xelatex', '/Library/TeX/texbin/latex', false);
    expect(c[0]).toBe('/Library/TeX/texbin/latex/xelatex');
    expect(c).toContain('xelatex');
    expect(c).toContain('/Library/TeX/texbin/xelatex');
  });
});

describe('locatePdfEngines (#344)', () => {
  it('finds engines in well-known install dirs when the process PATH misses them', async () => {
    const { engine } = makeEngine();
    mockExec.existing.add('/Library/TeX/texbin/xelatex');
    const located = await locate(engine);
    expect(located.xelatex).toBe('/Library/TeX/texbin/xelatex');
    expect(located.pdflatex).toBeNull();
    expect(located.lualatex).toBeNull();
    expect(located.wkhtmltopdf).toBeNull();
  });

  it('prefers the PATH resolution over well-known dirs', async () => {
    const { engine } = makeEngine();
    mockExec.existing.add('xelatex');
    mockExec.existing.add('/Library/TeX/texbin/xelatex');
    expect((await locate(engine)).xelatex).toBe('xelatex');
  });

  it('prefers the configured directory over an engine also on PATH', async () => {
    const { engine } = makeEngine({ pdfEnginePath: '/opt/tex/bin' });
    mockExec.existing.add('xelatex');
    mockExec.existing.add('/opt/tex/bin/xelatex');
    expect((await locate(engine)).xelatex).toBe('/opt/tex/bin/xelatex');
  });

  it('leaves detection elsewhere intact when the configured location resolves nothing', async () => {
    const { engine } = makeEngine({ pdfEnginePath: '/no/such/dir' });
    mockExec.existing.add('pdflatex');
    const located = await locate(engine);
    expect(located.pdflatex).toBe('pdflatex');
    expect(located.xelatex).toBeNull();
  });

  it('lets a configured binary path locate only its own engine', async () => {
    const { engine } = makeEngine({ pdfEnginePath: '/tex/xelatex' });
    mockExec.existing.add('/tex/xelatex');
    const located = await locate(engine);
    expect(located.xelatex).toBe('/tex/xelatex');
    expect(located.pdflatex).toBeNull();
    // The configured binary was probed for xelatex only, never as another engine.
    expect(mockExec.calls.filter(c => c.cmd === '/tex/xelatex')).toHaveLength(1);
  });
});

describe('PDF export invokes the probe-validated binary (#344)', () => {
  it('passes the well-known-dir engine path to pandoc via --pdf-engine', async () => {
    const { engine } = makeEngine();
    mockExec.existing.add('pandoc');
    mockExec.existing.add('/Library/TeX/texbin/pdflatex');

    const out = await engine.export(pdfOpts());
    expect(out.endsWith('.pdf')).toBe(true);

    const pandocCall = mockExec.calls.find(c => c.cmd === 'pandoc' && c.args.length > 1);
    expect(pandocCall).toBeDefined();
    expect(pandocCall?.args).toContain('--pdf-engine=/Library/TeX/texbin/pdflatex');
  });

  it('still fails by name when a pinned engine is found nowhere', async () => {
    const { engine } = makeEngine({ pdfEngine: 'xelatex' });
    mockExec.existing.add('pandoc');
    await expect(engine.export(pdfOpts())).rejects.toThrow(/xelatex/);
  });
});

describe('pandoc resolution (#344)', () => {
  it('searches well-known dirs for pandoc when the setting is the default', async () => {
    const { engine } = makeEngine();
    mockExec.existing.add('/opt/homebrew/bin/pandoc');
    expect(await engine.isPandocAvailable()).toBe(true);
  });

  it('uses a customized pandoc path exactly, without substitution', async () => {
    const { engine } = makeEngine({ pandocPath: '/custom/pandoc' });
    expect(await engine.isPandocAvailable()).toBe(false);
    // Only the configured path was probed — no augmentation for a custom path.
    expect(mockExec.calls.map(c => c.cmd)).toEqual(['/custom/pandoc']);

    mockExec.existing.add('/custom/pandoc');
    expect(await engine.isPandocAvailable()).toBe(true);
  });
});
