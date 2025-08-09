// Root ESLint flat config – single place to manage all rules (backend + frontend)
// Minimal, self-contained, and includes inline logging policy rules.

const js = require('@eslint/js');
const globals = require('globals');
let reactHooks;
try { reactHooks = require('eslint-plugin-react-hooks'); } catch { reactHooks = null; }

// Inline custom plugin: `logs`
const logsPlugin = {
  rules: {
    // Disallow emojis in any logger.* arguments
    'no-emoji-in-logs': {
      meta: { type: 'problem', docs: { description: 'Disallow emojis in log messages' } },
      create(context) {
  // Use Extended_Pictographic to avoid false positives from variation selectors/ZWJ
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
        function hasEmoji(node) {
          if (!node) return false;
          if (node.type === 'Literal' && typeof node.value === 'string') return EMOJI_RE.test(node.value);
          if (node.type === 'TemplateLiteral') {
            return node.quasis.some((q) => EMOJI_RE.test(q.value.raw || q.value.cooked || ''));
          }
          return false;
        }
        function isLoggerCall(node) {
          return (
            node.callee &&
            node.callee.type === 'MemberExpression' &&
            node.callee.property &&
            ['debug', 'info', 'warn', 'error', 'fatal'].includes(node.callee.property.name)
          );
        }
        return {
          CallExpression(node) {
            if (!isLoggerCall(node)) return;
            if ((node.arguments || []).some(hasEmoji)) {
              context.report({ node, message: 'Emojis are not allowed in log messages.' });
            }
          },
        };
      },
    },

    // Disallow gating info/warn behind debug checks
  'no-debug-gated-info-warn': {
      meta: { type: 'problem', docs: { description: 'info/warn should not be gated by debug checks' } },
      create(context) {
        function isInfoWarnCall(node) {
          return (
            node.callee &&
            node.callee.type === 'MemberExpression' &&
            node.callee.property &&
            ['info', 'warn'].includes(node.callee.property.name)
          );
        }
        function containsDebugCheck(test) {
          let found = false;
          const visited = new WeakSet();
          function visit(n) {
            if (!n || found) return;
            if (typeof n !== 'object') return;
            if (visited.has(n)) return;
            visited.add(n);
            switch (n.type) {
              case 'Identifier': {
                const name = n.name || '';
                if (/^(debug|currentDebug|DEBUG)$/i.test(name)) found = true;
                break;
              }
              case 'MemberExpression': {
                if (n.property && /^(debugEnabled|isDebugEnabled)$/i.test(n.property.name || '')) found = true;
                visit(n.object);
                visit(n.property);
                break;
              }
              case 'CallExpression': {
                if (
                  n.callee &&
                  n.callee.type === 'MemberExpression' &&
                  n.callee.property &&
                  n.callee.property.name === 'isDebugEnabled'
                ) {
                  found = true;
                }
                (n.arguments || []).forEach(visit);
                visit(n.callee);
                break;
              }
              default: {
                for (const key in n) {
                  if (Object.prototype.hasOwnProperty.call(n, key)) {
                    if (key === 'parent') continue;
                    const v = n[key];
                    if (v && typeof v === 'object') {
                      if (Array.isArray(v)) v.forEach(visit);
                      else visit(v);
                    }
                  }
                }
              }
            }
          }
          visit(test);
          return found;
        }
        return {
          CallExpression(node) {
            if (!isInfoWarnCall(node)) return;
            // Walk up ancestors to see if within an if/conditional using a debug check
            const sourceCode = context.sourceCode || context.getSourceCode();
            const ancestors = sourceCode.getAncestors(node);
            for (let i = ancestors.length - 1; i >= 0; i--) {
              const a = ancestors[i];
              if (a.type === 'IfStatement' || a.type === 'ConditionalExpression') {
                const test = a.type === 'IfStatement' ? a.test : a.test;
                if (containsDebugCheck(test)) {
                  context.report({ node, message: 'Do not gate info/warn logs behind debug checks.' });
                  return;
                }
              }
            }
          },
        };
      },
    },

    // Prefer message + metadata object (soft)
    'logger-requires-metadata': {
      meta: { type: 'suggestion', docs: { description: 'Prefer passing metadata object with logs' } },
      create(context) {
        function isLogCall(node) {
          return (
            node.callee &&
            node.callee.type === 'MemberExpression' &&
            node.callee.property &&
            ['info', 'warn', 'error', 'debug', 'fatal'].includes(node.callee.property.name)
          );
        }
        return {
          CallExpression(node) {
            if (!isLogCall(node)) return;
            const args = node.arguments || [];
            if (args.length <= 1) {
              // One string or template only
              if (
                args.length === 1 &&
                (args[0].type === 'Literal' && typeof args[0].value === 'string' || args[0].type === 'TemplateLiteral')
              ) {
                context.report({ node, message: 'Consider adding a metadata object to logs for context.' });
              }
            }
          },
        };
      },
    },

    // Encourage including an Error object or { err } when logging errors
    'error-object-in-logger-error': {
      meta: { type: 'suggestion', docs: { description: 'Include Error object or { err } in logger.error' } },
      create(context) {
        function isErrorCall(node) {
          return (
            node.callee &&
            node.callee.type === 'MemberExpression' &&
            node.callee.property &&
            node.callee.property.name === 'error'
          );
        }
        function hasErrorArg(arg) {
          if (!arg) return false;
          if (arg.type === 'Identifier' && /^(err|error|e)$/i.test(arg.name)) return true;
          if (arg.type === 'NewExpression' && arg.callee && arg.callee.name === 'Error') return true;
          if (arg.type === 'ObjectExpression') {
            return arg.properties.some((p) => {
              const keyName = p.key && (p.key.name || (p.key.value != null ? String(p.key.value) : ''));
              return /^(err|error)$/i.test(keyName || '');
            });
          }
          if (arg.type === 'MemberExpression') {
            const prop = arg.property && (arg.property.name || (arg.property.value != null ? String(arg.property.value) : ''));
            if (prop && /^(stack|message)$/i.test(prop)) return true;
          }
          return false;
        }
        return {
          CallExpression(node) {
            if (!isErrorCall(node)) return;
            const args = node.arguments || [];
            if (!args.some(hasErrorArg)) {
              context.report({ node, message: 'Include an Error object or { err } when logging errors.' });
            }
          },
        };
      },
    },

    // Avoid logging raw req/res objects and request bodies/headers
  'no-raw-req-res-body-logging': {
      meta: { type: 'suggestion', docs: { description: 'Avoid logging raw req/res or req.body/headers' } },
      create(context) {
        function isLogCall(node) {
          return (
            node.callee &&
            node.callee.type === 'MemberExpression' &&
            node.callee.property &&
            ['info', 'warn', 'error', 'debug', 'fatal'].includes(node.callee.property.name)
          );
        }
        function mentionsReqRes(node) {
          let found = false;
          const visited = new WeakSet();
          function visit(n) {
            if (!n || found) return;
            if (typeof n !== 'object') return;
            if (visited.has(n)) return;
            visited.add(n);
            if (n.type === 'Identifier' && /^(req|res)$/i.test(n.name)) { found = true; return; }
            if (n.type === 'MemberExpression') {
              const obj = n.object;
              const prop = n.property;
              if (obj && obj.type === 'Identifier' && /^(req|res)$/i.test(obj.name)) { found = true; }
              const propName = prop && (prop.name || (prop.value != null ? String(prop.value) : ''));
              if (propName && /^(body|headers|rawHeaders)$/i.test(propName)) { found = true; }
              visit(obj); visit(prop);
              return;
            }
            for (const key in n) {
              if (Object.prototype.hasOwnProperty.call(n, key)) {
                if (key === 'parent') continue;
                const v = n[key];
                if (v && typeof v === 'object') {
                  if (Array.isArray(v)) v.forEach(visit); else visit(v);
                }
              }
            }
          }
          visit(node);
          return found;
        }
        return {
          CallExpression(node) {
            if (!isLogCall(node)) return;
            // Only analyze arguments, not the entire node to avoid cycles
            const args = node.arguments || [];
            for (const arg of args) {
              if (mentionsReqRes(arg)) {
                context.report({ node, message: 'Avoid logging raw req/res or request bodies/headers.' });
                break;
              }
            }
          },
        };
      },
    },
  },
};

module.exports = [
  // Global ignores
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.min.js', '**/*.bundle.js', 'portracker.tar', 'scripts/**'] },

  // Backend (Node.js, CJS)
  {
    files: ['backend/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    plugins: { logs: logsPlugin },
    rules: {
      ...js.configs.recommended.rules,
  'no-console': 'error',
  // Eliminate warnings across the codebase (temporarily disable noisy rules)
  'no-unused-vars': 'off',
  'no-useless-escape': 'off',
  'no-empty': 'off',
  'logs/no-emoji-in-logs': 'error',
  'logs/no-debug-gated-info-warn': 'error',
  'logs/logger-requires-metadata': 'off',
  'logs/error-object-in-logger-error': 'off',
  'logs/no-raw-req-res-body-logging': 'off',
    },
  },

  // Frontend (browser, ESM + JSX)
  {
    files: ['frontend/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { logs: logsPlugin, ...(reactHooks ? { 'react-hooks': reactHooks } : {}) },
    rules: {
      ...js.configs.recommended.rules,
  'no-console': 'error',
  'no-unused-vars': 'off',
  'no-useless-escape': 'off',
  'no-empty': 'off',
      ...(reactHooks ? { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' } : {}),
  'logs/no-emoji-in-logs': 'error',
  'logs/no-debug-gated-info-warn': 'error',
  'logs/logger-requires-metadata': 'off',
  'logs/error-object-in-logger-error': 'off',
  'logs/no-raw-req-res-body-logging': 'off',
    },
  },

  // Allow console in logger implementation files
  {
    files: ['backend/lib/logger.js', 'frontend/src/lib/logger.js'],
    // Disable console rule and custom logging plugin rules so logger impls don't self-flag
    rules: {
      'no-console': 'off',
      'logs/no-emoji-in-logs': 'off',
      'logs/no-debug-gated-info-warn': 'off',
      'logs/logger-requires-metadata': 'off',
      'logs/error-object-in-logger-error': 'off',
      'logs/no-raw-req-res-body-logging': 'off',
    },
  },
];
