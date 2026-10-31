#!/usr/bin/env node
/**
 * Builds assets/css/dark-mode.css from WordPress' own stylesheets. Every
 * declaration that sets a colour is repeated with its dark counterpart under
 * the same selector, so coverage follows core instead of a hand-kept list.
 * Run per WordPress release:
 * YOAST_VERSION=2850 node bin/build.mjs /path/to/wordpress /path/to/plugins
 *
 * Canvas styles are left out: what is inside the editor belongs to the theme.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const postcss = require(process.env.POSTCSS_PATH || 'postcss');

const wp = resolve(process.argv[2] || '');
const plugins = process.argv[3] ? resolve(process.argv[3]) : '';
const root = new URL('..', import.meta.url).pathname;

const SOURCES = [
  ...[ 'common', 'forms', 'dashboard', 'list-tables', 'edit', 'revisions', 'media', 'themes', 'about', 'nav-menus', 'widgets', 'site-icon', 'l10n', 'site-health', 'code-editor', 'customize-controls', 'customize-nav-menus', 'customize-widgets' ].map((name) => `wp-admin/css/${name}.css`),
  ...[ 'buttons', 'media-views', 'wp-pointer', 'wp-auth-check', 'jquery-ui-dialog' ].map((name) => `wp-includes/css/${name}.css`),
  ...[ 'block-editor', 'editor', 'components', 'edit-post', 'edit-site', 'preferences', 'commands', 'patterns', 'reusable-blocks', 'widgets', 'format-library', 'edit-widgets', 'customize-widgets', 'media-utils', 'block-directory' ].map((name) => `wp-includes/css/dist/${name}/style.css`),
  'wp-includes/css/dist/theme/design-tokens.css',
];

// Rules for the content of the editor canvas, not for its frame
// Plugins with their own admin screens, loaded only when they are active
const PLUGINS = {
  'activitypub': [ 'activitypub/assets/css/activitypub-admin.css', 'activitypub/assets/css/activitypub-welcome.css', 'activitypub/assets/css/activitypub-post-preview.css' ],
  'dude-ai': [ 'dude-ai/assets/admin.css' ],
  'wordpress-seo': [ 'tailwind', 'admin-global', 'dashboard', 'general-page', 'new-settings', 'academy', 'support', 'plans', 'redirects', 'metabox', 'modal', 'yst_plugin_tools', 'yst_seo_score' ].map((name) => `wordpress-seo/css/dist/${name}-${process.env.YOAST_VERSION}.css`),
};

// The editor also copies any stylesheet naming .wp-block or .editor-styles-wrapper into the canvas
const CANVAS = /\.editor-styles-wrapper|\.wp-block|\.is-root-container|\.block-editor-block-list__layout|\.block-editor-iframe__/;

const ROLES = [
  [ /^(background|background-color)$/, 'surface' ],
  [ /^(color|fill|stroke|caret-color|text-decoration-color|-webkit-text-fill-color)$/, 'text' ],
  [ /^(border|border-(top|right|bottom|left|block|inline|color)(-color|-start|-end)*|outline|outline-color|box-shadow|column-rule)/, 'line' ],
];

const COLOR = /#[0-9a-f]{3,8}\b|rgba?\((?:[^()]|\([^()]*\))*\)/gi;

// The admin colour scheme's accent is too dark for text on a dark ground
const ACCENT = /^var\(--wp-(components-color-accent|admin-theme-color)\b/;

function parseColor(value) {
  if (value[0] === '#') {
    let hex = value.slice(1);
    if (hex.length < 6) {
      hex = [ ...hex ].map((digit) => digit + digit).join('');
    }
    const [ r, g, b ] = [ 0, 2, 4 ].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
    return { r, g, b, a: hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1 };
  }
  const parts = value.match(/[\d.]+%?/g);
  if (!parts || parts.length < 3) {
    return null;
  }
  const [ r, g, b ] = parts.map((part) => parseFloat(part) / 255);
  return { r, g, b, a: parts[3] === undefined ? 1 : parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1) };
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklch({ r, g, b }) {
  const [ lr, lg, lb ] = [ r, g, b ].map(toLinear);
  const l = Math.cbrt(0.4122 * lr + 0.5363 * lg + 0.0514 * lb);
  const m = Math.cbrt(0.2119 * lr + 0.6807 * lg + 0.1074 * lb);
  const s = Math.cbrt(0.0883 * lr + 0.2817 * lg + 0.63 * lb);
  const L = 0.2105 * l + 0.7937 * m - 0.0041 * s;
  const A = 1.9779 * l - 2.4286 * m + 0.4506 * s;
  const B = 0.0259 * l + 0.7828 * m - 0.8087 * s;
  return { L, C: Math.hypot(A, B), H: Math.atan2(B, A) };
}

function fromOklch({ L, C, H }) {
  const A = C * Math.cos(H);
  const B = C * Math.sin(H);
  const l = (L + 0.3963 * A + 0.2158 * B) ** 3;
  const m = (L - 0.1056 * A - 0.0639 * B) ** 3;
  const s = (L - 0.0895 * A - 1.2915 * B) ** 3;
  const channels = [
    4.0768 * l - 3.3077 * m + 0.2310 * s,
    -1.2684 * l + 2.6098 * m - 0.3413 * s,
    -0.0042 * l - 0.7034 * m + 1.707 * s,
  ];
  return channels.map((c) => Math.round(Math.min(1, Math.max(0, toGamma(Math.max(0, c)))) * 255));
}

const print = ([ r, g, b ], a) => (a < 1 ? `rgb(${r} ${g} ${b} / ${+a.toFixed(3)})` : `#${[ r, g, b ].map((c) => c.toString(16).padStart(2, '0')).join('')}`);

const NEUTRAL_HUE = -1.1;
const neutral = (L, C) => ({ L, C: Math.min(C, 0.012), H: NEUTRAL_HUE });

// White cards sit a step above the grey page, as they do in the light admin
function surface(color) {
  const { L, C, H } = color;
  // Faint black hover tints turn white, modal scrims stay as they are
  if (color.a <= 0.15 && L < 0.25) {
    return { white: color.a * 1.2 };
  }
  if (L < 0.62 || C > 0.1) {
    return null;
  }
  if (L >= 0.985) {
    return neutral(0.245, C);
  }
  if (L >= 0.93) {
    return C > 0.02 ? { L: 0.27, C: C * 1.1, H } : neutral(0.2, C);
  }
  return C > 0.02 ? { L: 0.3, C: Math.min(C, 0.06), H } : neutral(0.31, C);
}

function text({ L, C, H }) {
  if (L >= 0.68) {
    return null;
  }
  return { L: Math.max(0.74, 0.97 - 0.42 * L), C, H };
}

function line(color) {
  const { L, C, H } = color;
  if (color.a < 1 && L < 0.25) {
    return { white: Math.min(color.a * 0.6 + 0.02, 0.12) };
  }
  if (L < 0.6 || C > 0.1) {
    return null;
  }
  return C > 0.02 ? { L: 0.42, C: Math.min(C, 0.06), H } : neutral(0.38 + (1 - L) * 0.18, C);
}

// Fields and checkboxes are outlined in near-black on white; on a dark ground the outline turns light
const FIELD = /\binput\b|select\b|textarea|checkbox|radio|__input/;

function fieldLine(color) {
  const { L, C } = color;
  if (color.a === 1 && C <= 0.05 && (L < 0.4 || (L >= 0.55 && L < 0.9))) {
    return neutral(0.62, C);
  }
  return line(color);
}

const MAP = { surface, text, line, fieldLine };

function darken(value, role) {
  let changed = false;
  const unquoted = value.replace(/url\([^)]*\)/g, (url) => url.replace(/#/g, '\u0000'));
  const output = unquoted.replace(COLOR, (match) => {
    const parsed = parseColor(match);
    if (!parsed || parsed.a === 0) {
      return match;
    }
    const mapped = MAP[role]({ ...toOklch(parsed), a: parsed.a });
    if (!mapped) {
      return match;
    }
    changed = true;
    return mapped.white !== undefined ? `rgb(255 255 255 / ${+mapped.white.toFixed(3)})` : print(fromOklch(mapped), parsed.a);
  }).replace(/\u0000/g, '#');
  return changed ? output : null;
}

function roleOf(decl) {
  if (decl.prop.startsWith('--')) {
    if (!decl.prop.startsWith('--wpds-color-')) {
      return null;
    }
    if (/background|surface/.test(decl.prop)) {
      return 'surface';
    }
    if (/stroke|border|line/.test(decl.prop)) {
      return 'line';
    }
    return /color|foreground|fg/.test(decl.prop) ? 'text' : null;
  }
  return ROLES.find(([ pattern ]) => pattern.test(decl.prop))?.[1] ?? null;
}

function convert(rule) {
  const selectors = rule.selectors.filter((selector) => !CANVAS.test(selector));
  if (!selectors.length) {
    return '';
  }

  const hasSolidColour = rule.nodes.some((node) => node.type === 'decl' && /^background/.test(node.prop) && [ ...(node.value.match(COLOR) || []) ].some((match) => {
    const parsed = parseColor(match);
    return parsed && toOklch(parsed).C > 0.1;
  }));

  const isField = selectors.some((selector) => FIELD.test(selector));

  const declarations = rule.nodes.filter((node) => node.type === 'decl').flatMap((decl) => {
    const role = 'line' === roleOf(decl) && isField ? 'fieldLine' : roleOf(decl);
    if (!role) {
      return [];
    }
    if (role === 'text' && ACCENT.test(decl.value)) {
      return [ `${decl.prop}:color-mix(in oklab,${decl.value} 45%,#fff)${decl.important ? '!important' : ''}` ];
    }
    const value = role === 'text' && hasSolidColour ? null : darken(decl.value, role);
    if (!value && decl.prop.startsWith('--')) {
      return [];
    }
    // Unchanged values are repeated too: they have to keep beating the rules before them
    // The editor also prints the tokens inline on <html>
    return [ `${decl.prop}:${value ?? decl.value}${decl.important || decl.prop.startsWith('--') ? '!important' : ''}` ];
  });

  // Design tokens have to beat the same :root rule wherever core prints it, and the editor's provider prints them inline again
  const tokens = selectors.length === 1 && selectors[0] === ':root' && rule.nodes.every((node) => node.type !== 'decl' || node.prop.startsWith('--'));
  const target = tokens ? ':root:root,[data-wpds-root-provider]' : selectors.join(',').replace(/:root/g, ':root:root');
  return declarations.length ? `${target}{${declarations.join(';')}}\n` : '';
}

function walk(container) {
  return container.nodes.map((node) => {
    if (node.type === 'rule' && !/keyframes/.test(node.parent?.name ?? '')) {
      return convert(node);
    }
    if (node.type === 'atrule' && [ 'media', 'supports' ].includes(node.name)) {
      const inner = walk(node);
      return inner ? `@${node.name} ${node.params}{\n${inner}}\n` : '';
    }
    return '';
  }).join('');
}

const generate = (base, sources) => sources.filter((source) => existsSync(join(base, source))).map((source) => {
  const css = readFileSync(join(base, source), 'utf8');
  return `/* ${source} */\n${walk(postcss.parse(css))}`;
}).join('');

const generated = generate(wp, SOURCES);

const header = `/* Simple Dark Mode for WP Dashboard. Built by bin/build.mjs from WordPress' stylesheets; edit src/. */\n:root{color-scheme:dark}\n`;
const handwritten = [ 'src/overrides.css', 'src/plugins.css' ].map((file) => readFileSync(join(root, file), 'utf8')).join('\n');

writeFileSync(join(root, 'assets/css/dark-mode.css'), header + generated + handwritten);

if (plugins) {
  for (const [ slug, sources ] of Object.entries(PLUGINS)) {
    writeFileSync(join(root, `assets/css/${slug}.css`), generate(plugins, sources));
  }
}
console.log(`${(generated.length / 1024).toFixed(0)} KB generated`);
