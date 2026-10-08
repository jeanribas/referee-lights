/**
 * PostCSS: CSS que navegador ANTIGO também entende, sem mudar nada no novo.
 *
 * Premissa do projeto: as telas abrem em qualquer navegador (celular velho,
 * TV que não atualiza). O CSS gerado usa recursos que navegador antigo
 * descarta inteiros — a declaração some e o elemento fica sem cor/tamanho.
 *
 * 1. rgb(15 23 42 / 0.5) → rgba(15, 23, 42, 0.5): a sintaxe com espaço é de
 *    2018 (Chrome 65, Safari 12.1). Mesma cor, só a escrita muda.
 * 2. Antes de cada declaração com clamp()/min()/max(), unidades de contêiner
 *    (cqw…) ou de viewport dinâmica (dvh…), entra uma declaração de reserva
 *    só com o que navegador antigo entende. No navegador novo as duas são
 *    válidas e vale a última (a original) — nada muda. No antigo a original
 *    é descartada e fica a reserva:
 *      dvh/svh/lvh → vh · cqw/cqh/cqi/cqb → vw/vh/vw/vh
 *      clamp(a, b, c) → c (o tamanho pensado para tela grande)
 *      min(x, y) / max(x, y) → o argumento fixo (sem vw/vh), senão o 1º
 *
 * ATENÇÃO: o cache do Next (.next/cache) não percebe mudança NESTE arquivo.
 * Mudou aqui? Apague .next antes de buildar, senão sai o CSS antigo.
 */
const FN_RE = /\b(clamp|min|max)\(/i;
const MODERN_RE = /\b(clamp|min|max)\(|\d(cqw|cqh|cqi|cqb|dvh|svh|lvh|dvw|svw|lvw)\b/i;

/** Acha o fechamento do parêntese que abre em `open`. */
function closeParen(value, open) {
  let depth = 0;
  for (let i = open; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Separa argumentos no nível de cima (vírgulas fora de parênteses). */
function splitArgs(inner) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const isFixed = (arg) => !/(vw|vh|vmin|vmax|cq[whib]|dv[wh]|sv[wh]|lv[wh]|%)/.test(arg);

/** Troca clamp/min/max pelo argumento escolhido, de dentro para fora. */
function resolveFunctions(value) {
  let guard = 0;
  let m;
  while ((m = FN_RE.exec(value)) && guard++ < 50) {
    const open = m.index + m[0].length - 1;
    const close = closeParen(value, open);
    if (close < 0) return null;
    const args = splitArgs(value.slice(open + 1, close)).map((a) => resolveFunctions(a));
    if (args.some((a) => a == null)) return null;
    const fn = m[1].toLowerCase();
    let pick;
    if (fn === 'clamp') pick = args[2] ?? args[args.length - 1];
    else pick = args.find(isFixed) ?? args[0];
    // calc() dentro de clamp etc. continua calc (entendido desde 2013)
    value = value.slice(0, m.index) + pick + value.slice(close + 1);
  }
  return value;
}

function fallbackFor(value) {
  let v = value
    .replace(/(\d)(dvh|svh|lvh)\b/gi, '$1vh')
    .replace(/(\d)(dvw|svw|lvw)\b/gi, '$1vw')
    .replace(/(\d)cq[wi]\b/gi, '$1vw')
    .replace(/(\d)cq[hb]\b/gi, '$1vh');
  v = resolveFunctions(v);
  if (!v || MODERN_RE.test(v) || v === value) return null;
  return v;
}

const RGB_SPACE = /rgba?\(\s*(-?[\d.]+%?)\s+(-?[\d.]+%?)\s+(-?[\d.]+%?)\s*(?:\/\s*([^)]+?))?\s*\)/gi;

function commaRgb(value) {
  return value.replace(RGB_SPACE, (_, r, g, b, a) => {
    if (a == null) return `rgb(${r}, ${g}, ${b})`;
    let alpha = a.trim();
    if (/^[\d.]+%$/.test(alpha)) alpha = String(parseFloat(alpha) / 100);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  });
}

/**
 * 3. gap em flexbox só existe desde 2020/21 (Chrome 84, Safari 14.1). Para
 *    cada regra de gap, uma regra irmã com margem entre os filhos — que só
 *    vale com <html class="no-flexgap">, classe que o _document põe apenas
 *    quando o navegador não tem flex gap. Em navegador novo nunca casa.
 */
function gapFallback(rule) {
  // uma classe só; classes arbitrárias têm escapes como `\2c ` (vírgula + espaço)
  if (rule.__rlGap || !rule.selector || !/^\.(?:\\[0-9a-fA-F]{1,6} ?|\\.|[^\s>+~,\\])+$/.test(rule.selector)) return;
  let row = null;
  let col = null;
  rule.walkDecls((d) => {
    const v = MODERN_RE.test(d.value) ? fallbackFor(d.value) : d.value;
    if (!v) return;
    if (d.prop === 'gap') {
      const parts = v.trim().split(/\s+(?![^(]*\))/);
      row = parts[0];
      col = parts[1] ?? parts[0];
    } else if (d.prop === 'row-gap') row = v;
    else if (d.prop === 'column-gap') col = v;
  });
  if (row == null && col == null) return;
  const sel = rule.selector;
  const extra = [];
  if (row != null && row !== '0' && row !== '0px') {
    extra.push(rule.clone({ selector: `.no-flexgap .flex-col${sel} > * + *`, nodes: [] }).append({ prop: 'margin-top', value: row }));
  }
  if (col != null && col !== '0' && col !== '0px') {
    extra.push(
      rule
        .clone({
          selector: `.no-flexgap .flex${sel}:not(.flex-col) > * + *, .no-flexgap .inline-flex${sel}:not(.flex-col) > * + *`,
          nodes: []
        })
        .append({ prop: 'margin-left', value: col })
    );
    // ícone + texto (ponto do status, logo do GitHub): o texto não é
    // elemento, então `* + *` não casa — o espaço vai no único filho
    extra.push(
      rule
        .clone({ selector: `.no-flexgap .inline-flex${sel}:not(.flex-col) > :only-child`, nodes: [] })
        .append({ prop: 'margin-right', value: col })
    );
  }
  rule.__rlGap = true;
  let anchor = rule;
  for (const r of extra) {
    r.__rlGap = true;
    anchor.after(r);
    anchor = r;
  }
}

module.exports = () => ({
  postcssPlugin: 'referee-lights-compat',
  Rule(rule) {
    if (/\.(sm\\:|md\\:|lg\\:|xl\\:|landscape\\:)?gap-/.test(rule.selector)) gapFallback(rule);
  },
  Declaration(decl) {
    if (decl.__rlCompat) return;
    // 4. Grid: `gap` só desde Chrome 66 / Safari 12; antes era grid-gap
    //    (que o navegador novo ainda aceita como sinônimo — a original vem
    //    depois e vale).
    if ((decl.prop === 'gap' || decl.prop === 'row-gap' || decl.prop === 'column-gap') && !decl.__rlGrid) {
      decl.__rlGrid = true;
      const v = MODERN_RE.test(decl.value) ? fallbackFor(decl.value) : decl.value;
      if (v) {
        const legacy = decl.clone({ prop: `grid-${decl.prop}`, value: v });
        legacy.__rlCompat = true;
        legacy.__rlGrid = true;
        decl.before(legacy);
      }
    }
    if (/rgba?\(/i.test(decl.value)) {
      const next = commaRgb(decl.value);
      if (next !== decl.value) decl.value = next;
    }
    if (MODERN_RE.test(decl.value) && !decl.prop.startsWith('--')) {
      const fb = fallbackFor(decl.value);
      if (fb) {
        const clone = decl.clone({ value: fb });
        clone.__rlCompat = true;
        decl.__rlCompat = true;
        decl.before(clone);
      }
    }
  }
});
module.exports.postcss = true;
