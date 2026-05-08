import { mkdir, readFile, rm, writeFile, copyFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const webDir = path.join(distDir, 'web');
const vendorSrcDir = path.join(rootDir, 'node_modules', '.vite', 'deps');
const vendorDestDir = path.join(distDir, 'vendor');

const FRONTEND_ENTRYPOINTS = [
  'index.tsx',
  'App.tsx',
  'types.ts',
  'components',
  'services'
];

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function rewriteModuleSpecifiers(code) {
  const rewriteRelative = (specifier) => {
    if (!specifier.startsWith('.')) {
      return specifier;
    }

    if (specifier.endsWith('.css')) {
      return null;
    }

    if (specifier.endsWith('.ts') || specifier.endsWith('.tsx')) {
      return specifier.replace(/\.tsx?$/, '.js');
    }

    if (path.extname(specifier)) {
      return specifier;
    }

    return `${specifier}.js`;
  };

  let rewritten = code.replace(/import\s+['"]([^'"]+\.css)['"];\s*/g, '');

  rewritten = rewritten.replace(
    /((?:import|export)\s+[^'"]*?\sfrom\s*['"])([^'"]+)(['"])/g,
    (_, prefix, specifier, suffix) => {
      const next = rewriteRelative(specifier);
      return next === null ? '' : `${prefix}${next}${suffix}`;
    }
  );

  rewritten = rewritten.replace(
    /((?:import)\(\s*['"])([^'"]+)(['"]\s*\))/g,
    (_, prefix, specifier, suffix) => {
      const next = rewriteRelative(specifier);
      return next === null ? '' : `${prefix}${next}${suffix}`;
    }
  );

  return rewritten;
}

async function collectSourceFiles(targetPath, bucket) {
  const stats = await stat(targetPath);
  if (stats.isDirectory()) {
    const entries = await readdir(targetPath);
    for (const entry of entries) {
      await collectSourceFiles(path.join(targetPath, entry), bucket);
    }
    return;
  }

  if (/\.(ts|tsx)$/.test(targetPath)) {
    bucket.push(targetPath);
  }
}

async function emitFrontendModules() {
  await rm(webDir, { recursive: true, force: true });
  await mkdir(webDir, { recursive: true });

  const sourceFiles = [];
  for (const entry of FRONTEND_ENTRYPOINTS) {
    await collectSourceFiles(path.join(rootDir, entry), sourceFiles);
  }

  for (const sourceFile of sourceFiles) {
    const relative = path.relative(rootDir, sourceFile);
    const outFile = path.join(webDir, relative).replace(/\.tsx?$/, '.js');
    const outDir = path.dirname(outFile);

    await mkdir(outDir, { recursive: true });

    const source = await readFile(sourceFile, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        jsx: ts.JsxEmit.React,
        sourceMap: false
      },
      fileName: normalizePath(relative)
    });

    const rewritten = rewriteModuleSpecifiers(transpiled.outputText);
    await writeFile(outFile, rewritten, 'utf8');
  }
}

async function copyVendorDeps() {
  await rm(vendorDestDir, { recursive: true, force: true });
  await mkdir(vendorDestDir, { recursive: true });

  const entries = await readdir(vendorSrcDir);
  for (const entry of entries) {
    if (!/\.(js|map|json)$/.test(entry)) continue;
    await copyFile(path.join(vendorSrcDir, entry), path.join(vendorDestDir, entry));
  }

  await writeFile(
    path.join(vendorDestDir, 'react-wrapper.js'),
    `import ReactModule from './react.js';
export default ReactModule;
export const {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition
} = ReactModule;
`,
    'utf8'
  );

  await writeFile(
    path.join(vendorDestDir, 'react-dom-client-wrapper.js'),
    `import ReactDOMClientModule from './react-dom_client.js';
export default ReactDOMClientModule;
export const { createRoot, hydrateRoot, version } = ReactDOMClientModule;
`,
    'utf8'
  );
}

async function updateIndexHtml() {
  const htmlPath = path.join(distDir, 'index.html');
  const original = await readFile(htmlPath, 'utf8');
  const version = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);

  const importMap = `
  <script type="importmap">
    {
        "imports": {
        "react": "/vendor/react-wrapper.js",
        "react-dom/client": "/vendor/react-dom-client-wrapper.js",
        "lucide-react": "/vendor/lucide-react.js",
        "recharts": "/vendor/recharts.js",
        "axios": "/vendor/axios.js"
      }
    }
  </script>`;

  let next = original
    .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/g, '')
    .replace(/\s*<script type="module" crossorigin src="[^"]+"><\/script>/g, '');
  next = next.replace('</style>', `</style>\n${importMap}`);
  next = next.replace('</head>', `  <script type="module" crossorigin src="/web/index.js?v=${version}"></script>\n</head>`);
  next = next.replace(/href="\/assets\/app\.css\?v=[^"]+"/, `href="/assets/app.css?v=${version}"`);
  await writeFile(htmlPath, next, 'utf8');
}

async function main() {
  await emitFrontendModules();
  await copyVendorDeps();
  await updateIndexHtml();
  console.log('Web preview build completed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
