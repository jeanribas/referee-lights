import { Head, Html, Main, NextScript } from 'next/document';

/**
 * Igual ao documento padrão do Next, mais uma detecção de recursos que roda
 * antes de tudo, em ES3: marca o <html> com `no-flexgap` / `no-cssvars` em
 * navegador antigo. O CSS de compatibilidade (postcss-compat.js) só vale com
 * essas classes — em navegador novo elas nunca aparecem e nada muda.
 */
const FEATURE_DETECT = `(function(d){try{var h=d.documentElement,c=[],w=window;
if(!(w.CSS&&w.CSS.supports&&w.CSS.supports('--a','0')))c.push('no-cssvars');
var b=d.createElement('div'),s=b.style;s.display='flex';s.flexDirection='column';s.rowGap='1px';s.position='absolute';s.visibility='hidden';
b.appendChild(d.createElement('div'));b.appendChild(d.createElement('div'));h.appendChild(b);
if(b.scrollHeight!==1)c.push('no-flexgap');h.removeChild(b);
if(c.length)h.className=(h.className?h.className+' ':'')+c.join(' ');}catch(e){}})(document);`;

export default function Document() {
  return (
    <Html>
      <Head>
        <script dangerouslySetInnerHTML={{ __html: FEATURE_DETECT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
