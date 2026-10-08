module.exports = {
  plugins: {
    tailwindcss: {},
    // Prefixos também para navegador antigo (Android 4, iOS 7, TVs): o
    // browserslist do package.json é o alvo do JS do Next; as telas
    // universais rodam bem mais para trás. Prefixo extra não muda nada no
    // navegador novo (a declaração sem prefixo vem depois e vale).
    autoprefixer: {
      overrideBrowserslist: ['chrome >= 30', 'safari >= 7', 'ios_saf >= 7', 'android >= 4', 'firefox >= 30', 'samsung >= 4', 'opera >= 20']
    },
    './postcss-compat.js': {}
  }
};
