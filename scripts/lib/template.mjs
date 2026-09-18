/** 极简模板引擎：{{var}} / {{#if var}}…{{/if}} / {{#unless var}}…{{/unless}} / {{#each list}}…{{/each}} */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function lookup(scope, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), scope);
}

/** 变量查找：从最内层作用域向外回退，因此 {{#each}} 里仍能读到外层变量 */
function lookupInStack(stack, key) {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const value = lookup(stack[i], key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function findSection(template, startIndex) {
  const re = /\{\{#(if|unless|each)\s+[\w.]+\}\}|\{\{\/(?:if|unless|each)\}\}/g;
  re.lastIndex = startIndex;
  let depth = 1;
  let match;
  const bodyStart = startIndex;
  while ((match = re.exec(template))) {
    if (match[0].startsWith('{{#')) {
      depth += 1;
      continue;
    }
    depth -= 1;
    if (depth === 0) return [template.slice(bodyStart, match.index), re.lastIndex];
  }
  throw new Error('模板区块未闭合');
}

function renderWithStack(template, stack, options) {
  const resolve = (key) => lookupInStack(stack, key);
  let out = '';
  let i = 0;

  while (i < template.length) {
    const open = template.indexOf('{{', i);
    if (open === -1) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, open);
    const close = template.indexOf('}}', open);
    if (close === -1) {
      out += template.slice(open);
      break;
    }
    const token = template.slice(open + 2, close).trim();
    i = close + 2;

    if (token.startsWith('#if ')) {
      const [inner, next] = findSection(template, i);
      if (resolve(token.slice(4).trim())) out += renderWithStack(inner, stack, options);
      i = next;
      continue;
    }
    if (token.startsWith('#unless ')) {
      const [inner, next] = findSection(template, i);
      if (!resolve(token.slice(8).trim())) out += renderWithStack(inner, stack, options);
      i = next;
      continue;
    }
    if (token.startsWith('#each ')) {
      const [inner, next] = findSection(template, i);
      const list = resolve(token.slice(6).trim()) || [];
      for (const item of list) {
        stack.push(item);
        out += renderWithStack(inner, stack, options);
        stack.pop();
      }
      i = next;
      continue;
    }

    const raw = token.endsWith('!');
    const key = raw ? token.slice(0, -1).trim() : token;
    const value = resolve(key);
    if (value == null) {
      // 未提供的变量视为空；strict 模式保留占位符，便于测试发现遗漏
      out += options.strict ? `{{${key}}}` : '';
      continue;
    }
    out += raw ? String(value) : escapeHtml(value);
  }
  return out;
}

export function render(template, data = {}, options = {}) {
  return renderWithStack(template, [data], options);
}
