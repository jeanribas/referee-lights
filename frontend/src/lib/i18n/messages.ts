import { APP_LOCALES, DEFAULT_LOCALE, type AppLocale } from './config';

type CommonMessages = {
  labels: {
    room: string;
    adminPinShort: string;
    status: string;
  };
  /** Estado da conexão como aparece nas telas (o socket usa os nomes em inglês) */
  connection: {
    connected: string;
    connecting: string;
    disconnected: string;
  };
  errors: Record<string, string>;
  confirmations: {
    regenerateTokens: string;
  };
  srOnly: {
    close: string;
  };
  languageLabel: string;
  languages: Record<AppLocale, string>;
};

type DisplayMessages = {
  metaDescription?: string;
  menu: {
    optionsTitle: string;
    quickActionsTitle: string;
    fullscreenEnter: string;
    fullscreenExit: string;
    goToAdmin: string;
    showQr: string;
    toggleButton: string;
  };
  zoom: {
    label: string;
    reset: string;
  };
  wake: {
    title: string;
    keepAwake: string;
    on: string;
    off: string;
    warning: string;
  };
  status: {
    waiting: string;
  };
  missing: {
    title: string;
    description: string;
    goToAdmin: string;
  };
  interval: {
    primaryLabel: string;
    secondaryLabel: string;
    endMessage: string;
  };
  countdown: {
    primaryLabel: string;
    warningLabel: string;
  };
};

type AdminMessages = {
  metaDescription?: string;
  header: {
    title: string;
    generatingLinks: string;
  };
  timer: {
    title: string;
    start: string;
    stop: string;
    resetDefault: string;
    minutesLabel: string;
    set: string;
  };
  interval: {
    title: string;
    configured: string;
    remaining: string;
    hours: string;
    minutes: string;
    seconds: string;
    set: string;
    start: string;
    pause: string;
    reset: string;
    showInterval: string;
    showLights: string;
    note: string;
    cancel: string;
    confirmStart: string;
    confirmReset: string;
  };
  /** Cartão "Key Relay" do bundle; para quem opera, "Automação" */
  automation: {
    title: string;
    active: string;
    inactive: string;
    description: string;
    keys: string;
    enable: string;
    disable: string;
    configTitle: string;
    validDecision: string;
    invalidDecision: string;
    pressKey: string;
  };
  preview: {
    waiting: string;
    showQr: string;
    goToDisplay: string;
    goToLegend: string;
    goToTimer: string;
  };
  qrMenu: {
    title: string;
    description: string;
    regenerate: string;
    regenerating: string;
    loading: string;
    /** Timer/display: só mostra os links atuais. */
    viewDescription: string;
    /** Página aberta como localhost: o celular não chega nesse endereço. */
    localhostHint: string;
    loadError: string;
    ariaLabel: string;
    targets: {
      left: string;
      center: string;
      right: string;
    };
    shortTargets: {
      left: string;
      center: string;
      right: string;
    };
  };
  roomSetup: {
    title: string;
    description: string;
    create: {
      title: string;
      description: string;
      steps: [string, string];
      cta: string;
      note: string;
    };
    join: {
      title: string;
      description: string;
      roomLabel: string;
      roomPlaceholder: string;
      pinLabel: string;
      pinPlaceholder: string;
      submit: string;
    };
  };
  fullPage: {
    loadingTitle: string;
    loadingDescription: string;
    connectingTitle: string;
    connectingDescription: string;
  };
  footer: {
    openSource: string;
    hostedBy: string;
    hostedByName: string;
  };
};

type LegendMessages = {
  metaDescription?: string;
  title: string;
  statusRoomSuffix: string;
  missingCredentials: string;
  errorPrefix: string;
  buttons: {
    paletteOpen: string;
    paletteClose: string;
    placeholdersShow: string;
    placeholdersHide: string;
    frameShow: string;
    frameHide: string;
    digits: string;
    wake: string;
  };
  digitsModes: {
    hhmmss: string;
    mmss: string;
  };
  palette: {
    title: string;
    selectColor: string;
    customColor: string;
    timerColor: string;
    transparentBackground: string;
  };
  share: {
    title: string;
    description: string;
    save: string;
    saved: string;
    copy: string;
    copied: string;
  };
  wakeWarning: string;
  waiting: string;
  /** Concluir a configuração: salva e mostra como levar a legenda para o OBS */
  done: {
    button: string;
    unsaved: string;
    title: string;
    saved: string;
    obsLabel: string;
    obsHint: string;
    useWindow: string;
    useWindowHint: string;
    back: string;
  };
};

type RefereeMessages = {
  metaDescription?: string;
  selectorTitle: string;
  invalidRoute: string;
  center: {
    title: string;
    timeLabel: string;
    start: string;
    pause: string;
    reset: string;
    valid: string;
  };
  side: {
    leftTitle: string;
    rightTitle: string;
    valid: string;
  };
  missing: {
    title: string;
    description: string;
  };
};

type HomeMessages = {
  metaTitle: string;
  metaDescription: string;
  ctaAdmin: string;
  heroBadge: string;
  heroTitle: string;
  heroDesc: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;
  whatIsTitle: string;
  whatIsDesc: string;
  stepsTitle: string;
  stepsSubtitle: string;
  steps: { title: string; desc: string; icon: string }[];
  screensTitle: string;
  screensSubtitle: string;
  screens: { path: string; title: string; desc: string; href: string }[];
  featuresTitle: string;
  features: { icon: string; title: string; desc: string }[];
  ctaTitle: string;
  ctaDesc: string;
};

type FaqMessages = {
  metaTitle: string;
  metaDescription: string;
  title: string;
  subtitle: string;
  backHome: string;
  seeAll: string;
  items: { q: string; a: string }[];
};

type WindowsMessages = {
  metaTitle: string;
  metaDescription: string;
  title: string;
  subtitle: string;
  backHome: string;
  steps: { title: string; desc: string }[];
  requirements: { title: string; items: string[] };
  troubleshooting: { title: string; items: { q: string; a: string }[] };
  cta: string;
  ctaAlt: string;
};

/**
 * Barra de consentimento. O texto vive aqui, e não no script de terceiros: o `s.js` do
 * stats.assist.com.br traz um banner de fallback com texto fixo em português
 * ("só microsites, sem consent conhecido", diz o próprio script), sem opção de
 * idioma. Este site é trilíngue, então desligamos o dele (data-banner="0") e
 * montamos o nosso — ver components/CookieConsent.tsx.
 */
type ConsentMessages = {
  ariaLabel: string;
  text: string;
  accept: string;
  reject: string;
};

export type Messages = {
  common: CommonMessages;
  consent: ConsentMessages;
  home: HomeMessages;
  faq: FaqMessages;
  windows: WindowsMessages;
  display: DisplayMessages;
  admin: AdminMessages;
  legend: LegendMessages;
  referee: RefereeMessages;
};

const MESSAGES: Record<AppLocale, Messages> = {
  'pt-BR': {
    consent: {
      ariaLabel: 'Aviso de privacidade',
      text: 'Medimos o uso do site de forma anônima, para saber o que ajuda. Sem cookies e sem registrar seu IP.',
      accept: 'Aceitar',
      reject: 'Somente essenciais'
    },
    common: {
      labels: {
        room: 'Sala',
        adminPinShort: 'PIN admin',
        status: 'Status'
    },
    connection: {
      connected: 'Conectado',
      connecting: 'Conectando',
      disconnected: 'Desconectado'
    },
    errors: {
      invalid_pin: 'PIN inválido. Atualize a URL pelo painel admin.',
      room_not_found: 'Sala não encontrada.',
        request_failed: 'Falha ao conectar ao servidor.',
        not_authorised: 'Acesso não autorizado.',
        token_revoked: 'Links antigos foram revogados. Gere novos QR Codes.',
        invalid_token: 'Token expirado ou inválido.',
        invalid_credentials: 'Usuário ou senha inválidos.',
        unknown_error: 'Erro inesperado.',
        invalid_payload: 'Dados inválidos enviados ao servidor.'
      },
      confirmations: {
        regenerateTokens: 'Gerar novos links desconecta árbitros conectados. Deseja continuar?'
      },
    srOnly: {
      close: 'Fechar'
    },
    languageLabel: 'Idioma',
    languages: {
      'pt-BR': 'Português',
      'en-US': 'English',
      'es-ES': 'Español'
    }
  },
    home: {
      metaTitle: 'Luzes de Arbitragem para Powerlifting IPF',
      metaDescription: 'Sistema gratuito e open-source de luzes de arbitragem em tempo real para competições de Powerlifting IPF. Passo a passo completo para usar.',
      ctaAdmin: 'Iniciar sessão',
      heroBadge: 'Gratuito \u2022 Open Source \u2022 IPF',
      heroTitle: 'Luzes de arbitragem para sua competição de Powerlifting',
      heroDesc: 'Sistema completo que conecta árbitros, display, cronômetro e transmissão ao vivo em tempo real. Funciona em celular, tablet ou computador.',
      heroCtaPrimary: 'Criar sessão agora',
      heroCtaSecondary: 'Como funciona?',
      whatIsTitle: 'O que é o Referee Lights?',
      whatIsDesc: 'O Referee Lights é uma plataforma web que substitui os tradicionais painéis físicos de luzes de arbitragem. Cada árbitro usa seu próprio celular para votar (GOOD LIFT ou NO LIFT), e as decisões aparecem instantaneamente no display principal — ideal para competições presenciais ou transmitidas ao vivo.',
      stepsTitle: 'Como usar em 5 passos',
      stepsSubtitle: 'Do zero até sua competição funcionando. Sem instalar nada no celular dos árbitros.',
      steps: [
        { icon: '\u{1F4BB}', title: 'Abra o Painel Admin', desc: 'Clique em "Criar sessão agora" acima. O sistema gera automaticamente uma sala com PIN e QR Codes para os árbitros.' },
        { icon: '\u{1F4F1}', title: 'Distribua os QR Codes', desc: 'Cada árbitro escaneia o QR Code correspondente (esquerdo, central, direito) com a câmera do celular. O console do árbitro abre direto no navegador — sem baixar aplicativo.' },
        { icon: '\u{1F4FA}', title: 'Abra o Display', desc: 'No painel admin, clique em "Ir para Display" e coloque essa tela no telão ou projetor. As luzes dos árbitros aparecem aqui em tempo real.' },
        { icon: '\u2705', title: 'Comece a competição', desc: 'Os árbitros votam pelo celular. As luzes (branca = válido, vermelha = inválido) aparecem no display quando todos votam. Use o timer e os intervalos pelo painel admin.' },
        { icon: '\u{1F3A5}', title: 'Transmissão ao vivo (opcional)', desc: 'Abra a tela de Legenda/Chroma Key e capture no OBS Studio para sobrepor as luzes na sua live.' },
      ],
      screensTitle: 'Telas da plataforma',
      screensSubtitle: 'Cada tela tem uma função específica. Clique para saber mais.',
      screens: [
        { path: '/admin', title: 'Painel Admin', desc: 'Criar sessões, QR codes, timer, intervalos', href: '/admin' },
        { path: '/display', title: 'Display', desc: 'Luzes dos árbitros, timer e alertas sonoros', href: '/display' },
        { path: '/ref/:posição', title: 'Console do Árbitro', desc: 'Botões de voto e cartões IPF no celular', href: '/ref' },
        { path: '/legend', title: 'Legenda / Chroma Key', desc: 'Overlay para transmissão ao vivo', href: '/legend' },
        { path: '/timer', title: 'Cronômetro', desc: 'Painel standalone de timer e intervalos', href: '/timer' },
      ],
      featuresTitle: 'Por que usar o Referee Lights?',
      features: [
        { icon: '\u26A1', title: 'Tempo real', desc: 'Sincronização instantânea entre todos os dispositivos. Sem delay.' },
        { icon: '\u{1F4F1}', title: 'Sem instalar nada', desc: 'Funciona direto no navegador do celular. Os árbitros só escaneiam o QR Code.' },
        { icon: '\u{1F3F4}', title: 'Cartões IPF', desc: 'Amarelo, vermelho e vermelho+amarelo conforme regras da IPF.' },
        { icon: '\u{1F3A5}', title: 'Pronto para live', desc: 'Tela de chroma key para OBS Studio ou qualquer software de streaming.' },
        { icon: '\u{1F512}', title: 'Sessões seguras', desc: 'PIN administrativo + tokens JWT rotativos para cada árbitro.' },
        { icon: '\u{1F30E}', title: '3 idiomas', desc: 'Português, inglês e espanhol com detecção automática.' },
      ],
      ctaTitle: 'Pronto para começar?',
      ctaDesc: 'Crie uma sessão em segundos. Gratuito, sem cadastro e sem instalar nada.',
    },
    faq: {
      metaTitle: 'Perguntas frequentes',
      metaDescription: 'Respostas às dúvidas mais comuns sobre o Referee Lights: é gratuito, funciona offline, dispositivos compatíveis, regras IPF, transmissão ao vivo e como reportar bugs.',
      title: 'Perguntas frequentes',
      subtitle: 'O que atletas e organizadores de competição costumam perguntar antes do primeiro campeonato.',
      backHome: 'Voltar para a Home',
      seeAll: 'Ver todas as perguntas',
      items: [
        {
          q: 'O que é o Referee Lights?',
          a: 'O Referee Lights é um sistema gratuito de luzes de arbitragem para competições de Powerlifting que segue as regras da IPF. Três árbitros votam pelo próprio celular (GOOD LIFT ou NO LIFT) e as luzes aparecem em tempo real no telão da competição — sem painéis físicos e sem instalar aplicativo.',
        },
        {
          q: 'É realmente gratuito? Existe versão paga ou limite de uso?',
          a: 'Sim, o Referee Lights é gratuito, sem cadastro, sem limite de sessões e sem versão premium. O código-fonte é público no GitHub e o uso é livre para atletas, clubes, federações e organizações sem fins lucrativos; apenas o uso comercial (revenda ou oferta como serviço pago) exige autorização do autor.',
        },
        {
          q: 'Preciso instalar algum aplicativo ou criar conta?',
          a: 'Não. Tudo funciona direto no navegador: o organizador cria uma sessão em refereelights.app e os árbitros entram escaneando um QR Code com a câmera do celular. Não há download de app, cadastro nem configuração.',
        },
        {
          q: 'Funciona offline, sem internet?',
          a: 'Sim. Além da versão online, existe um pacote portátil para Windows que roda o sistema inteiro na rede Wi-Fi local, sem internet — basta extrair o ZIP e executar. É a opção recomendada para ginásios com conexão instável.',
        },
        {
          q: 'Em quais dispositivos funciona? Quais são os requisitos?',
          a: 'Funciona em qualquer celular, tablet ou computador com um navegador moderno (como Chrome, Edge ou Firefox). Para o pacote offline, o requisito é um PC com Windows 10 ou superior (64 bits) e uma rede Wi-Fi para conectar os dispositivos dos árbitros.',
        },
        {
          q: 'Como funciona o sistema de luzes branca e vermelha?',
          a: 'Seguindo as regras da IPF, cada um dos três árbitros vota GOOD LIFT (luz branca) ou NO LIFT (luz vermelha), e as três luzes só são reveladas no display quando todos votaram. O sistema também inclui os cartões de penalidade da IPF (amarelo, vermelho e vermelho+amarelo) e o cronômetro oficial de 1 minuto.',
        },
        {
          q: 'Serve para outras federações além da IPF?',
          a: 'Sim. O padrão de três árbitros com luzes branca e vermelha é usado pela maioria das federações de powerlifting, então o sistema atende qualquer evento que siga essa convenção. Os cartões de penalidade seguem especificamente o regulamento da IPF.',
        },
        {
          q: 'Quantos dispositivos posso conectar e como funciona a sincronização?',
          a: 'Cada sessão conecta os três consoles de árbitro (esquerdo, central e direito) mais as telas de apoio: painel admin, display para o telão, cronômetro e overlay de transmissão. Todas compartilham o mesmo estado em tempo real via WebSocket — um voto aparece instantaneamente em todas as telas.',
        },
        {
          q: 'Pode ser usado em competições oficiais?',
          a: 'O sistema implementa o fluxo completo de arbitragem da IPF: três árbitros, luzes, cartões de penalidade e tempos oficiais. A homologação de equipamentos em campeonatos oficiais, porém, depende de cada federação — consulte a organização do seu evento antes de usar.',
        },
        {
          q: 'Como uso as luzes na transmissão ao vivo (OBS)?',
          a: 'A tela de Legenda/Chroma Key exibe as luzes e o cronômetro sobre um fundo de cor sólida, pronta para ser capturada no OBS Studio ou em qualquer software de streaming. Adicione a página como fonte de navegador (ou capture a janela) e aplique o filtro de chroma key para sobrepor as decisões na sua live.',
        },
        {
          q: 'Como reporto um bug ou peço uma funcionalidade?',
          a: 'Abra uma issue no repositório do projeto no GitHub (github.com/jeanribas/referee-lights) descrevendo o problema ou a ideia. O código é público, então sugestões e contribuições são bem-vindas.',
        },
        {
          q: 'Posso instalar o Referee Lights como aplicativo no celular?',
          a: 'Sim. O Referee Lights é um web app instalável: no menu do navegador, use "Adicionar à tela inicial" (Android/iPhone) ou "Instalar" (Chrome/Edge no computador) e ele abre em janela própria, como um aplicativo, com ícone na tela inicial. Não está nas lojas de apps e continua precisando de conexão com o servidor — pela internet ou pela rede local no modo Windows.',
        },
        {
          q: 'Qual a diferença do Referee Lights para outros sistemas de luzes?',
          a: 'O Referee Lights é gratuito, roda direto no navegador sem instalar aplicativo, não exige cadastro e tem o código público no GitHub. Ele reúne em uma só plataforma as luzes, os cartões IPF, o cronômetro, o modo offline para Windows e o overlay de chroma key para transmissões — sem hardware dedicado e sem mensalidade.',
        },
      ],
    },
    windows: {
      metaTitle: 'Instalar no Windows',
      metaDescription: 'Guia passo a passo para baixar e rodar o Referee Lights no Windows. Um arquivo só, sem instalar nada: baixe e abra.',
      title: 'Como usar no Windows',
      subtitle: 'Um arquivo só — baixe, abra e use. Sem instalar nada.',
      backHome: 'Voltar para a Home',
      steps: [
        { title: 'Baixe o RefereeLights.exe', desc: 'Clique em "Baixar para Windows". O arquivo RefereeLights.exe é o aplicativo inteiro: não precisa instalar nem extrair nada.' },
        { title: 'Abra o arquivo', desc: 'Dê dois cliques no RefereeLights.exe. Na primeira vez o Windows pode avisar sobre arquivo baixado da internet: clique em "Mais informações" e depois em "Executar assim mesmo".' },
        { title: 'Permita o acesso à rede', desc: 'Se o Windows perguntar sobre o firewall, permita o acesso em redes privadas. Isso é o que deixa os celulares dos árbitros se conectarem.' },
        { title: 'Crie a sessão', desc: 'O navegador abre sozinho no painel. Crie uma sessão e distribua os QR Codes para os árbitros. O ícone do Referee Lights fica perto do relógio do Windows: por ele você reabre o painel, copia o endereço para os celulares ou fecha o aplicativo.' },
        { title: 'Conecte os dispositivos', desc: 'Os árbitros devem estar na mesma rede Wi-Fi. Eles acessam pelo IP da máquina (ex.: http://192.168.1.100:3000) escaneando o QR Code.' },
      ],
      requirements: {
        title: 'Requisitos',
        items: [
          'Windows 10 ou superior (64 bits)',
          'Nenhuma instalação necessária — tudo vem dentro do RefereeLights.exe',
          'Rede Wi-Fi para conectar os dispositivos dos árbitros',
          'Navegador moderno (Chrome, Edge, Firefox)',
        ],
      },
      troubleshooting: {
        title: 'Problemas comuns',
        items: [
          { q: 'O Windows ou o antivírus bloqueou o arquivo', a: 'Clique em "Mais informações" e depois em "Executar assim mesmo". Se o antivírus não deixar abrir, use a versão alternativa (zip): extraia e dê dois cliques no Iniciar.cmd.' },
          { q: 'Os árbitros não conseguem conectar', a: 'Verifique se todos estão na mesma rede Wi-Fi e se a rede do computador está como "Privada". No ícone do Referee Lights perto do relógio, use "Liberar no firewall" e "Endereço para celulares".' },
          { q: 'Erro de porta em uso', a: 'Se a porta 3000 estiver ocupada, o Referee Lights escolhe outra sozinho (3001, 3002...) e mostra o endereço certo no painel e no ícone perto do relógio.' },
          { q: 'Onde ficam as salas e como remover', a: 'Os dados ficam em %LOCALAPPDATA%\\RefereeLights e continuam entre atualizações. Para remover tudo, use "Remover dados e sair" no ícone perto do relógio e apague o RefereeLights.exe.' },
          { q: 'Como atualizar', a: 'Quando houver versão nova, o painel avisa. Você escolhe quando atualizar — nunca durante uma competição em andamento.' },
        ],
      },
      cta: 'Baixar para Windows',
      ctaAlt: 'Versão alternativa (zip)',
    },
    display: {
      metaDescription:
        'Display sincronizado para eventos IPF com luzes, cronômetro e alertas de intervalo conectados ao painel Referee Lights.',
      menu: {
        optionsTitle: 'Opções',
        quickActionsTitle: 'Ações rápidas',
        fullscreenEnter: 'Entrar em tela cheia',
        fullscreenExit: 'Sair da tela cheia',
        goToAdmin: 'Ir para Admin',
        showQr: 'QR Codes dos árbitros',
        toggleButton: 'Alternar menu do display'
      },
      zoom: {
        label: 'Zoom',
        reset: 'Resetar'
      },
      wake: {
        title: 'Tela ativa',
        keepAwake: 'Manter tela ativa',
        on: 'Tela mantida acesa',
        off: 'OFF',
        warning: 'Não foi possível ativar o modo sem descanso. Toque na tela ou tente novamente.'
      },
      status: {
        waiting: 'Aguardando conexão...'
      },
      missing: {
        title: 'Display não configurado',
        description: 'Adicione `roomId` e `pin` à URL, por exemplo `/display?roomId=ABCD&pin=1234`, ou abra o painel admin para gerar uma nova sessão.',
        goToAdmin: 'Ir para Admin'
      },
      interval: {
        primaryLabel: 'Próximo Round',
        secondaryLabel: 'Troca das pedidas',
        endMessage: 'TROCA DE PEDIDAS ENCERRADA'
      },
      countdown: {
        primaryLabel: 'Intervalo Programado',
        warningLabel: 'Aviso (-3 min)'
      }
    },
    admin: {
      metaDescription:
        'Controle o fluxo das luzes IPF: crie sessões com PIN, gere QR Codes, ajuste timers e acompanhe árbitros em tempo real.',
      header: {
        title: 'Administração da Plataforma',
        generatingLinks: 'Gerando novos links...'
      },
      timer: {
        title: 'Timer',
        start: 'Iniciar',
        stop: 'Parar',
        resetDefault: 'Reset 1:00',
        minutesLabel: 'Minutos',
        set: 'Definir'
      },
      interval: {
        title: 'Intervalo',
        configured: 'Configurado',
        remaining: 'Restante',
        hours: 'Horas',
        minutes: 'Minutos',
        seconds: 'Segundos',
        set: 'Definir',
        start: 'Iniciar intervalo',
        pause: 'Pausar',
        reset: 'Reset intervalo',
        showInterval: 'Mostrar intervalo',
        showLights: 'Mostrar luzes',
        note: 'O display exibirá um aviso em vermelho três minutos antes do término.',
        cancel: 'Cancelar',
        confirmStart: 'Confirmar início',
        confirmReset: 'Confirmar reset'
      },
      automation: {
        title: 'Automação',
        active: 'Ativa',
        inactive: 'Inativa',
        description: 'Ao revelar a decisão, envia a tecla para a janela em foco no computador do servidor.',
        keys: 'Teclas',
        enable: 'Ativar automação',
        disable: 'Desativar',
        configTitle: 'Configurar teclas',
        validDecision: 'Decisão válida (Good Lift)',
        invalidDecision: 'Decisão inválida (No Lift)',
        pressKey: 'Pressione uma tecla...'
      },
      preview: {
        waiting: 'Aguardando estado...',
        showQr: 'Mostrar QR Codes',
        goToDisplay: 'Ir para Display',
        goToLegend: 'Legenda',
        goToTimer: 'Cronômetro'
      },
      qrMenu: {
        title: 'Compartilhar com árbitros',
        description: 'Escaneie o QR Code correspondente para abrir o console do árbitro em um dispositivo conectado à mesma sessão.',
        regenerate: 'Gerar novos links',
        regenerating: 'Gerando...',
        loading: 'Carregando QR Codes...',
        viewDescription: 'Para o árbitro que precisa abrir de novo a página dele: escaneie o QR Code da posição. Os links continuam os mesmos e ninguém é desconectado.',
        localhostHint: 'Esta tela está aberta como "localhost": o celular não acessa esse endereço. Abra esta tela pelo link do admin (endereço da rede) para o QR funcionar.',
        loadError: 'Não foi possível carregar os QR Codes. Verifique a conexão e tente de novo.',
        ariaLabel: 'QR Codes para árbitros',
        targets: {
          left: 'Árbitro Esquerdo',
          center: 'Árbitro Central',
          right: 'Árbitro Direito'
        },
        shortTargets: {
          left: 'Esquerdo',
          center: 'Central',
          right: 'Direito'
        }
      },
      roomSetup: {
        title: 'Configurar plataforma',
        description: 'Gerencie as sessões do sistema em um só lugar. Gere novas salas com PIN administrativo e QR Codes exclusivos ou retome o controle de uma sessão existente informando o identificador e o PIN correspondente.',
        create: {
          title: 'Criar nova sessão',
          description: 'Configure uma sala completa em segundos com PIN administrativo, QR Codes para cada árbitro e um link de display pronto para compartilhar.',
          steps: [
            'Compartilhe o PIN com a equipe e distribua automaticamente os QR Codes gerados para cada árbitro.',
            'Inicie a sessão com timers, cartões e votos sincronizados em tempo real a partir deste painel.'
          ],
          cta: 'Gerar sessão agora',
          note: 'Tokens podem ser rotacionados sempre que necessário após a criação da sala.'
        },
        join: {
          title: 'Entrar em sessão existente',
          description: 'Informe os dados da sala para reconectar este painel a uma sessão ativa e continuar a operação sem interrupções.',
          roomLabel: 'Sala',
          roomPlaceholder: 'ABCD',
          pinLabel: 'PIN Administrativo',
          pinPlaceholder: '1234',
          submit: 'Entrar no painel'
        }
      },
      fullPage: {
        loadingTitle: 'Carregando',
        loadingDescription: 'Preparando painel...',
        connectingTitle: 'Conectando',
        connectingDescription: 'Sincronizando dados da plataforma...'
      },
      footer: {
        openSource: 'Open Source',
        hostedBy: 'Desenvolvido e hospedado por',
        hostedByName: 'assist.com.br'
      }
    },
    legend: {
      metaDescription:
        'Painel complementar com timer customizável, modo chroma key e status em tempo real para transmissões IPF.',
      title: 'Legenda',
      statusRoomSuffix: ' - Sala {roomId}',
      missingCredentials: 'Informe `roomId` e `pin` na URL para conectar.',
      errorPrefix: 'Erro:',
      buttons: {
        paletteOpen: 'Cor de Fundo',
        paletteClose: 'Fechar Cor',
        placeholdersShow: 'Mostrar Molduras',
        placeholdersHide: 'Ocultar Molduras',
        frameShow: 'Mostrar Linha',
        frameHide: 'Ocultar Linha',
        digits: 'Dígitos: {mode}',
        wake: 'Tela ativa: {state}'
      },
      digitsModes: {
        hhmmss: 'HH:MM:SS',
        mmss: 'MM:SS'
      },
      palette: {
        title: 'Paleta rápida',
        selectColor: 'Selecionar {color}',
        customColor: 'Cor custom',
        timerColor: 'Cronômetro',
        transparentBackground: 'Fundo transparente'
      },
      share: {
        title: 'Link de compartilhamento',
        description: 'Abra este link para exibir apenas a legenda, sem os controles de configuração.',
        save: 'Salvar',
        saved: 'Salvo',
        copy: 'Copiar link',
        copied: 'Copiado'
      },
      wakeWarning: 'Não foi possível ativar o modo sem descanso. Toque na tela ou tente novamente.',
      waiting: 'Aguardando conexão...',
      done: {
        button: 'Concluir',
        unsaved: 'Alterações não salvas',
        title: 'Legenda pronta',
        saved: 'Configuração salva para todas as legendas desta sala.',
        obsLabel: 'Link para o OBS',
        obsHint: 'No OBS, adicione uma Fonte de Navegador com este link.',
        useWindow: 'Usar esta janela',
        useWindowHint: 'Esta janela vira a versão limpa, sem controles, para capturar.',
        back: 'Voltar a editar'
      }
    },
    referee: {
      metaDescription:
        'Console móvel do árbitro com botões GOOD/NO LIFT, cartões IPF e sincronização em tempo real com o painel Referee Lights.',
      selectorTitle: 'Selecione a posição do árbitro',
      invalidRoute: 'Rota de árbitro inválida.',
      center: {
        title: 'Árbitro Central',
        timeLabel: 'Tempo oficial',
        start: 'Iniciar',
        pause: 'Pausar',
        reset: 'Resetar',
        valid: 'GOOD LIFT'
      },
      side: {
        leftTitle: 'Árbitro Lateral Esquerdo',
        rightTitle: 'Árbitro Lateral Direito',
        valid: 'GOOD LIFT'
      },
      missing: {
        title: 'Console indisponível',
        description: 'Utilize um QR Code atualizado para acessar `{judge}` com sala e token válidos.'
      }
    },
  },
  'en-US': {
    consent: {
      ariaLabel: 'Privacy notice',
      text: 'We measure site usage anonymously, to learn what helps. No cookies, and your IP is never logged.',
      accept: 'Accept',
      reject: 'Essential only'
    },
    common: {
      labels: {
        room: 'Room',
        adminPinShort: 'Admin PIN',
        status: 'Status'
      },
      connection: {
        connected: 'Connected',
        connecting: 'Connecting',
        disconnected: 'Disconnected'
      },
      errors: {
        invalid_pin: 'Invalid PIN. Refresh the URL from the admin panel.',
        room_not_found: 'Room not found.',
        request_failed: 'Failed to connect to the server.',
        not_authorised: 'Unauthorized access.',
        token_revoked: 'Links have been revoked. Generate new QR Codes.',
        invalid_token: 'Token expired or invalid.',
        invalid_credentials: 'Invalid username or password.',
        unknown_error: 'Unexpected error.',
        invalid_payload: 'Invalid data sent to the server.'
      },
      confirmations: {
        regenerateTokens: 'Generating new links will disconnect connected referees. Continue?'
      },
    srOnly: {
      close: 'Close'
    },
    languageLabel: 'Language',
    languages: {
      'pt-BR': 'Português',
      'en-US': 'English',
      'es-ES': 'Español'
    }
  },
    home: {
      metaTitle: 'Referee Lights for IPF Powerlifting',
      metaDescription: 'Free, open-source, real-time referee light system for IPF Powerlifting competitions. Complete step-by-step guide.',
      ctaAdmin: 'Start session',
      heroBadge: 'Free \u2022 Open Source \u2022 IPF',
      heroTitle: 'Referee lights for your Powerlifting competition',
      heroDesc: 'A complete system connecting referees, display, timer, and live broadcasting in real time. Works on phones, tablets, or computers.',
      heroCtaPrimary: 'Create session now',
      heroCtaSecondary: 'How does it work?',
      whatIsTitle: 'What is Referee Lights?',
      whatIsDesc: 'Referee Lights is a web platform that replaces traditional physical referee light panels. Each referee uses their own phone to vote (GOOD LIFT or NO LIFT), and decisions appear instantly on the main display \u2014 perfect for in-person or live-streamed competitions.',
      stepsTitle: 'How to use in 5 steps',
      stepsSubtitle: 'From zero to a running competition. No app install needed on referee phones.',
      steps: [
        { icon: '\u{1F4BB}', title: 'Open the Admin Panel', desc: 'Click "Create session now" above. The system automatically generates a room with a PIN and QR Codes for the referees.' },
        { icon: '\u{1F4F1}', title: 'Share the QR Codes', desc: 'Each referee scans their corresponding QR Code (left, center, right) with their phone camera. The referee console opens directly in the browser \u2014 no app download needed.' },
        { icon: '\u{1F4FA}', title: 'Open the Display', desc: 'In the admin panel, click "Open Display" and put this screen on the projector or TV. Referee lights appear here in real time.' },
        { icon: '\u2705', title: 'Start the competition', desc: 'Referees vote on their phones. The lights (white = valid, red = invalid) appear on the display once all votes are in. Use the timer and intervals from the admin panel.' },
        { icon: '\u{1F3A5}', title: 'Live streaming (optional)', desc: 'Open the Legend/Chroma Key screen and capture it in OBS Studio to overlay referee decisions on your live stream.' },
      ],
      screensTitle: 'Platform screens',
      screensSubtitle: 'Each screen has a specific role. Click to learn more.',
      screens: [
        { path: '/admin', title: 'Admin Panel', desc: 'Create sessions, QR codes, timer, intervals', href: '/admin' },
        { path: '/display', title: 'Display', desc: 'Referee lights, timer, and audio alerts', href: '/display' },
        { path: '/ref/:position', title: 'Referee Console', desc: 'Vote buttons and IPF cards on mobile', href: '/ref' },
        { path: '/legend', title: 'Legend / Chroma Key', desc: 'Overlay for live broadcasting', href: '/legend' },
        { path: '/timer', title: 'Timer', desc: 'Standalone timer and interval panel', href: '/timer' },
      ],
      featuresTitle: 'Why use Referee Lights?',
      features: [
        { icon: '\u26A1', title: 'Real-time', desc: 'Instant synchronization across all devices. No delay.' },
        { icon: '\u{1F4F1}', title: 'No installation', desc: 'Works directly in the phone browser. Referees just scan the QR Code.' },
        { icon: '\u{1F3F4}', title: 'IPF Cards', desc: 'Yellow, red, and red+yellow per IPF rules.' },
        { icon: '\u{1F3A5}', title: 'Stream-ready', desc: 'Chroma key screen for OBS Studio or any streaming software.' },
        { icon: '\u{1F512}', title: 'Secure sessions', desc: 'Admin PIN + rotating JWT tokens for each referee.' },
        { icon: '\u{1F30E}', title: '3 languages', desc: 'Portuguese, English, and Spanish with automatic detection.' },
      ],
      ctaTitle: 'Ready to get started?',
      ctaDesc: 'Create a session in seconds. Free, no sign-up, no installation.',
    },
    faq: {
      metaTitle: 'Frequently asked questions',
      metaDescription: 'Answers to the most common questions about Referee Lights: is it free, offline use, supported devices, IPF rules, live streaming, and how to report bugs.',
      title: 'Frequently asked questions',
      subtitle: 'What athletes and meet organizers usually ask before their first competition.',
      backHome: 'Back to Home',
      seeAll: 'See all questions',
      items: [
        {
          q: 'What is Referee Lights?',
          a: 'Referee Lights is a free referee light system for Powerlifting competitions that follows IPF rules. Three referees vote from their own phones (GOOD LIFT or NO LIFT) and the lights appear in real time on the venue display — no physical light panels and no app install required.',
        },
        {
          q: 'Is it really free? Is there a paid version or usage limit?',
          a: 'Yes, Referee Lights is free, with no sign-up, no session limit, and no premium tier. The source code is public on GitHub and free to use for athletes, clubs, federations, and non-profits; only commercial use (reselling it or offering it as a paid service) requires the author’s permission.',
        },
        {
          q: 'Do I need to install an app or create an account?',
          a: 'No. Everything runs in the browser: the organizer creates a session at refereelights.app and referees join by scanning a QR Code with their phone camera. There is no app download, no registration, and no setup.',
        },
        {
          q: 'Does it work offline, without internet?',
          a: 'Yes. Besides the online version, there is a portable Windows package that runs the whole system on the local Wi-Fi network with no internet — just extract the ZIP and run it. It is the recommended option for venues with unreliable connections.',
        },
        {
          q: 'Which devices does it support? What are the requirements?',
          a: 'It works on any phone, tablet, or computer with a modern browser (such as Chrome, Edge, or Firefox). For the offline package, you need a PC running Windows 10 or later (64-bit) and a Wi-Fi network to connect the referees’ devices.',
        },
        {
          q: 'How does the white and red light system work?',
          a: 'Following IPF rules, each of the three referees votes GOOD LIFT (white light) or NO LIFT (red light), and the three lights are only revealed on the display once everyone has voted. The system also includes IPF penalty cards (yellow, red, and red+yellow) and the official 1-minute attempt clock.',
        },
        {
          q: 'Can I use it with federations other than the IPF?',
          a: 'Yes. The three-referee, white-and-red light convention is used by most powerlifting federations, so the system works for any event that follows it. The penalty cards specifically follow the IPF rulebook.',
        },
        {
          q: 'How many devices can connect, and how does synchronization work?',
          a: 'Each session connects the three referee consoles (left, center, right) plus the supporting screens: the admin panel, the main display, the timer, and the broadcast overlay. All of them share the same state in real time over WebSocket — a vote shows up instantly on every screen.',
        },
        {
          q: 'Can it be used in official competitions?',
          a: 'The system implements the full IPF refereeing flow: three referees, lights, penalty cards, and official timing. Equipment approval for sanctioned championships is up to each federation, though — check with your event’s organizers before using it.',
        },
        {
          q: 'How do I show the lights on a live stream (OBS)?',
          a: 'The Legend/Chroma Key screen shows the lights and the clock over a solid-color background, ready to be captured in OBS Studio or any streaming software. Add the page as a browser source (or capture the window) and apply a chroma key filter to overlay the decisions on your stream.',
        },
        {
          q: 'How do I report a bug or request a feature?',
          a: 'Open an issue in the project’s GitHub repository (github.com/jeanribas/referee-lights) describing the problem or the idea. The code is public, so suggestions and contributions are welcome.',
        },
        {
          q: 'Can I install Referee Lights as an app on my phone?',
          a: 'Yes. Referee Lights is an installable web app: from the browser menu, use "Add to Home Screen" (Android/iPhone) or "Install" (Chrome/Edge on desktop) and it opens in its own window, like a native app, with an icon on your home screen. It is not in the app stores and still needs a connection to the server — over the internet, or over the local network in Windows mode.',
        },
        {
          q: 'How is Referee Lights different from other referee light systems?',
          a: 'Referee Lights is free, runs directly in the browser with no app install, requires no account, and its code is public on GitHub. It bundles the lights, IPF penalty cards, timer, offline Windows mode, and chroma key broadcast overlay into a single platform — no dedicated hardware and no subscription.',
        },
      ],
    },
    windows: {
      metaTitle: 'Install on Windows',
      metaDescription: 'Step-by-step guide to download and run Referee Lights on Windows. One single file, nothing to install: download and open.',
      title: 'How to use on Windows',
      subtitle: 'One single file — download, open and use. Nothing to install.',
      backHome: 'Back to Home',
      steps: [
        { title: 'Download RefereeLights.exe', desc: 'Click "Download for Windows". RefereeLights.exe is the whole app: nothing to install or extract.' },
        { title: 'Open the file', desc: 'Double-click RefereeLights.exe. The first time, Windows may warn about a file downloaded from the internet: click "More info" and then "Run anyway".' },
        { title: 'Allow network access', desc: 'If Windows asks about the firewall, allow access on private networks. This is what lets the referees\' phones connect.' },
        { title: 'Create the session', desc: 'The browser opens the panel automatically. Create a session and share the QR Codes with the referees. The Referee Lights icon sits next to the Windows clock: use it to reopen the panel, copy the address for phones or quit the app.' },
        { title: 'Connect the devices', desc: 'Referees must be on the same Wi-Fi network. They access via the machine\'s IP address (e.g., http://192.168.1.100:3000) by scanning the QR Code.' },
      ],
      requirements: {
        title: 'Requirements',
        items: [
          'Windows 10 or later (64-bit)',
          'No installation needed — everything is inside RefereeLights.exe',
          'Wi-Fi network to connect the referees\' devices',
          'Modern browser (Chrome, Edge, Firefox)',
        ],
      },
      troubleshooting: {
        title: 'Common issues',
        items: [
          { q: 'Windows or the antivirus blocked the file', a: 'Click "More info" and then "Run anyway". If the antivirus will not let it open, use the alternative version (zip): extract it and double-click Iniciar.cmd.' },
          { q: 'Referees cannot connect', a: 'Make sure everyone is on the same Wi-Fi network and the computer\'s network is set to "Private". On the Referee Lights icon next to the clock, use "Allow through firewall" and "Address for phones".' },
          { q: 'Port already in use error', a: 'If port 3000 is busy, Referee Lights picks another one by itself (3001, 3002...) and shows the right address in the panel and in the icon next to the clock.' },
          { q: 'Where rooms are stored and how to remove', a: 'Data is kept in %LOCALAPPDATA%\\RefereeLights and survives updates. To remove everything, use "Remove data and quit" on the icon next to the clock and delete RefereeLights.exe.' },
          { q: 'How to update', a: 'When there is a new version, the panel tells you. You choose when to update — never during a competition in progress.' },
        ],
      },
      cta: 'Download for Windows',
      ctaAlt: 'Alternative version (zip)',
    },
    display: {
      metaDescription:
        'Synchronized IPF display with live lights, timers, and interval alerts managed from the Referee Lights admin panel.',
      menu: {
        optionsTitle: 'Options',
        quickActionsTitle: 'Quick actions',
        fullscreenEnter: 'Enter fullscreen',
        fullscreenExit: 'Exit fullscreen',
        goToAdmin: 'Go to Admin',
        showQr: 'Referee QR codes',
        toggleButton: 'Toggle display menu'
      },
      zoom: {
        label: 'Zoom',
        reset: 'Reset'
      },
      wake: {
        title: 'Screen awake',
        keepAwake: 'Keep screen awake',
        on: 'Screen kept awake',
        off: 'OFF',
        warning: 'Could not enable keep-awake mode. Tap the screen or try again.'
      },
      status: {
        waiting: 'Waiting for connection...'
      },
      missing: {
        title: 'Display not configured',
        description: 'Add `roomId` and `pin` to the URL, for example `/display?roomId=ABCD&pin=1234`, or open the admin panel to generate a new session.',
        goToAdmin: 'Go to Admin'
      },
      interval: {
        primaryLabel: 'Flight begins',
        secondaryLabel: 'Change openers',
        endMessage: 'OPENER CHANGES CLOSED'
      },
      countdown: {
        primaryLabel: 'Scheduled interval',
        warningLabel: 'Warning (-3 min)'
      }
    },
    admin: {
      metaDescription:
        'Control the IPF referee light setup: create sessions, rotate QR codes, tweak timers, and monitor judges in real time.',
      header: {
        title: 'Platform Admin',
        generatingLinks: 'Generating new links...'
      },
      timer: {
        title: 'Timer',
        start: 'Start',
        stop: 'Stop',
        resetDefault: 'Reset 1:00',
        minutesLabel: 'Minutes',
        set: 'Set'
      },
      interval: {
        title: 'Interval',
        configured: 'Configured',
        remaining: 'Remaining',
        hours: 'Hours',
        minutes: 'Minutes',
        seconds: 'Seconds',
        set: 'Set',
        start: 'Start interval',
        pause: 'Pause',
        reset: 'Reset interval',
        showInterval: 'Show interval',
        showLights: 'Show lights',
        note: 'The display will show a red warning three minutes before the end.',
        cancel: 'Cancel',
        confirmStart: 'Confirm start',
        confirmReset: 'Confirm reset'
      },
      automation: {
        title: 'Automation',
        active: 'Active',
        inactive: 'Inactive',
        description: 'When the decision is revealed, sends the key to the window in focus on the server computer.',
        keys: 'Keys',
        enable: 'Enable automation',
        disable: 'Disable',
        configTitle: 'Configure keys',
        validDecision: 'Valid decision (Good Lift)',
        invalidDecision: 'Invalid decision (No Lift)',
        pressKey: 'Press a key...'
      },
      preview: {
        waiting: 'Waiting for state...',
        showQr: 'Show QR Codes',
        goToDisplay: 'Open Display',
        goToLegend: 'Open Legend',
        goToTimer: 'Open Timer'
      },
      qrMenu: {
        title: 'Share with referees',
        description: 'Scan the matching QR Code to open the referee console on a device connected to this session.',
        regenerate: 'Generate new links',
        regenerating: 'Generating...',
        loading: 'Loading QR Codes...',
        viewDescription: 'For a referee who needs to reopen their page: scan the QR code for that position. The links stay the same and nobody is disconnected.',
        localhostHint: 'This screen is open as "localhost": phones cannot reach that address. Open this screen through the admin link (network address) for the QR codes to work.',
        loadError: 'Could not load the QR codes. Check the connection and try again.',
        ariaLabel: 'QR Codes for referees',
        targets: {
          left: 'Left Referee',
          center: 'Center Referee',
          right: 'Right Referee'
        },
        shortTargets: {
          left: 'Left',
          center: 'Center',
          right: 'Right'
        }
      },
      roomSetup: {
        title: 'Configure platform',
        description: 'Manage the system sessions in one place. Create new rooms with an admin PIN and dedicated QR Codes, or regain control of an existing session by entering its identifier and PIN.',
        create: {
          title: 'Create new session',
          description: 'Set up a complete room in seconds with an admin PIN, QR Codes for each referee, and a display link ready to share.',
          steps: [
            'Share the PIN with the team and automatically distribute the generated QR Codes to each referee.',
            'Start the session with timers, cards, and votes synchronized in real time from this panel.'
          ],
          cta: 'Create session now',
          note: 'Tokens can be rotated whenever necessary after the room is created.'
        },
        join: {
          title: 'Join existing session',
          description: 'Enter the session details to reconnect this panel to an active session and continue operating without interruptions.',
          roomLabel: 'Room',
          roomPlaceholder: 'ABCD',
          pinLabel: 'Admin PIN',
          pinPlaceholder: '1234',
          submit: 'Enter the panel'
        }
      },
      fullPage: {
        loadingTitle: 'Loading',
        loadingDescription: 'Preparing panel...',
        connectingTitle: 'Connecting',
        connectingDescription: 'Syncing platform data...'
      },
      footer: {
        openSource: 'Open Source',
        hostedBy: 'Developed and hosted by',
        hostedByName: 'assist.com.br'
      }
    },
    legend: {
      metaDescription:
        'Companion screen with customizable timer, chroma key background, and real-time status for IPF broadcasts.',
      title: 'Legend',
      statusRoomSuffix: ' - Room {roomId}',
      missingCredentials: 'Add `roomId` and `pin` to the URL to connect.',
      errorPrefix: 'Error:',
      buttons: {
        paletteOpen: 'Background color',
        paletteClose: 'Close color',
        placeholdersShow: 'Show frames',
        placeholdersHide: 'Hide frames',
        frameShow: 'Show dashed line',
        frameHide: 'Hide dashed line',
        digits: 'Digits: {mode}',
        wake: 'Screen awake: {state}'
      },
      digitsModes: {
        hhmmss: 'HH:MM:SS',
        mmss: 'MM:SS'
      },
      palette: {
        title: 'Quick palette',
        selectColor: 'Select {color}',
        customColor: 'Custom color',
        timerColor: 'Timer',
        transparentBackground: 'Transparent background'
      },
      share: {
        title: 'Share link',
        description: 'Open this link to display only the legend, without configuration controls.',
        save: 'Save',
        saved: 'Saved',
        copy: 'Copy link',
        copied: 'Copied'
      },
      wakeWarning: 'Could not enable keep-awake mode. Tap the screen or try again.',
      waiting: 'Waiting for connection...',
      done: {
        button: 'Done',
        unsaved: 'Unsaved changes',
        title: 'Legend ready',
        saved: 'Settings saved for every legend in this room.',
        obsLabel: 'Link for OBS',
        obsHint: 'In OBS, add a Browser Source with this link.',
        useWindow: 'Use this window',
        useWindowHint: 'This window becomes the clean version, with no controls, for capture.',
        back: 'Back to editing'
      }
    },
    referee: {
      metaDescription:
        'Mobile referee console with GOOD/NO LIFT controls, IPF cards, and real-time sync with the Referee Lights platform.',
      selectorTitle: 'Select referee position',
      invalidRoute: 'Invalid referee route.',
      center: {
        title: 'Center Referee',
        timeLabel: 'Official time',
        start: 'Start',
        pause: 'Pause',
        reset: 'Reset',
        valid: 'GOOD LIFT'
      },
      side: {
        leftTitle: 'Left Side Referee',
        rightTitle: 'Right Side Referee',
        valid: 'GOOD LIFT'
      },
      missing: {
        title: 'Console unavailable',
        description: 'Use an updated QR Code to access `{judge}` with a valid room and token.'
      }
    },
  },
  'es-ES': {
    consent: {
      ariaLabel: 'Aviso de privacidad',
      text: 'Medimos el uso del sitio de forma anónima, para saber qué ayuda. Sin cookies y sin registrar tu IP.',
      accept: 'Aceptar',
      reject: 'Solo esenciales'
    },
    common: {
      labels: {
        room: 'Sala',
        adminPinShort: 'PIN admin',
        status: 'Estado'
      },
      connection: {
        connected: 'Conectado',
        connecting: 'Conectando',
        disconnected: 'Desconectado'
      },
      errors: {
        invalid_pin: 'PIN inválido. Actualiza la URL desde el panel de administración.',
        room_not_found: 'Sala no encontrada.',
        request_failed: 'No se pudo conectar con el servidor.',
        not_authorised: 'Acceso no autorizado.',
        token_revoked: 'Los enlaces anteriores fueron revocados. Genera nuevos códigos QR.',
        invalid_token: 'Token expirado o inválido.',
        invalid_credentials: 'Usuario o contraseña inválidos.',
        unknown_error: 'Error inesperado.',
        invalid_payload: 'Datos inválidos enviados al servidor.'
      },
      confirmations: {
        regenerateTokens: 'Generar nuevos enlaces desconectará a los árbitros conectados. ¿Deseas continuar?'
      },
    srOnly: {
      close: 'Cerrar'
    },
    languageLabel: 'Idioma',
    languages: {
      'pt-BR': 'Portugués',
      'en-US': 'Inglés',
      'es-ES': 'Español'
    }
  },
    home: {
      metaTitle: 'Luces de Arbitraje para Powerlifting IPF',
      metaDescription: 'Sistema gratuito y open-source de luces de arbitraje en tiempo real para competencias de Powerlifting IPF. Guía paso a paso completa.',
      ctaAdmin: 'Iniciar sesión',
      heroBadge: 'Gratis \u2022 Open Source \u2022 IPF',
      heroTitle: 'Luces de arbitraje para tu competencia de Powerlifting',
      heroDesc: 'Sistema completo que conecta jueces, display, cronómetro y transmisión en vivo en tiempo real. Funciona en celular, tablet o computadora.',
      heroCtaPrimary: 'Crear sesión ahora',
      heroCtaSecondary: '\u00bfC\u00f3mo funciona?',
      whatIsTitle: '\u00bfQu\u00e9 es Referee Lights?',
      whatIsDesc: 'Referee Lights es una plataforma web que reemplaza los paneles f\u00edsicos tradicionales de luces de arbitraje. Cada juez usa su propio celular para votar (GOOD LIFT o NO LIFT), y las decisiones aparecen instant\u00e1neamente en la pantalla principal \u2014 ideal para competencias presenciales o transmitidas en vivo.',
      stepsTitle: 'C\u00f3mo usar en 5 pasos',
      stepsSubtitle: 'Desde cero hasta tu competencia funcionando. Sin instalar nada en el celular de los jueces.',
      steps: [
        { icon: '\u{1F4BB}', title: 'Abre el Panel Admin', desc: 'Haz clic en "Crear sesi\u00f3n ahora" arriba. El sistema genera autom\u00e1ticamente una sala con PIN y c\u00f3digos QR para los jueces.' },
        { icon: '\u{1F4F1}', title: 'Distribuye los c\u00f3digos QR', desc: 'Cada juez escanea el c\u00f3digo QR correspondiente (izquierdo, central, derecho) con la c\u00e1mara de su celular. La consola del juez se abre directo en el navegador \u2014 sin descargar aplicaci\u00f3n.' },
        { icon: '\u{1F4FA}', title: 'Abre el Display', desc: 'En el panel admin, haz clic en "Abrir Display" y coloca esa pantalla en el proyector o televisor. Las luces de los jueces aparecen aqu\u00ed en tiempo real.' },
        { icon: '\u2705', title: 'Comienza la competencia', desc: 'Los jueces votan desde su celular. Las luces (blanca = v\u00e1lido, roja = inv\u00e1lido) aparecen en el display cuando todos votan. Usa el timer y los intervalos desde el panel admin.' },
        { icon: '\u{1F3A5}', title: 'Transmisi\u00f3n en vivo (opcional)', desc: 'Abre la pantalla de Leyenda/Chroma Key y cap\u00farala en OBS Studio para superponer las luces en tu transmisi\u00f3n.' },
      ],
      screensTitle: 'Pantallas de la plataforma',
      screensSubtitle: 'Cada pantalla tiene una funci\u00f3n espec\u00edfica. Haz clic para saber m\u00e1s.',
      screens: [
        { path: '/admin', title: 'Panel Admin', desc: 'Crear sesiones, c\u00f3digos QR, timer, intervalos', href: '/admin' },
        { path: '/display', title: 'Display', desc: 'Luces de los jueces, timer y alertas sonoras', href: '/display' },
        { path: '/ref/:posici\u00f3n', title: 'Consola del Juez', desc: 'Botones de voto y tarjetas IPF en el celular', href: '/ref' },
        { path: '/legend', title: 'Leyenda / Chroma Key', desc: 'Overlay para transmisi\u00f3n en vivo', href: '/legend' },
        { path: '/timer', title: 'Cron\u00f3metro', desc: 'Panel standalone de timer e intervalos', href: '/timer' },
      ],
      featuresTitle: '\u00bfPor qu\u00e9 usar Referee Lights?',
      features: [
        { icon: '\u26A1', title: 'Tiempo real', desc: 'Sincronizaci\u00f3n instant\u00e1nea entre todos los dispositivos. Sin delay.' },
        { icon: '\u{1F4F1}', title: 'Sin instalar nada', desc: 'Funciona directo en el navegador del celular. Los jueces solo escanean el c\u00f3digo QR.' },
        { icon: '\u{1F3F4}', title: 'Tarjetas IPF', desc: 'Amarilla, roja y roja+amarilla seg\u00fan reglas de la IPF.' },
        { icon: '\u{1F3A5}', title: 'Listo para streaming', desc: 'Pantalla de chroma key para OBS Studio o cualquier software de streaming.' },
        { icon: '\u{1F512}', title: 'Sesiones seguras', desc: 'PIN administrativo + tokens JWT rotativos para cada juez.' },
        { icon: '\u{1F30E}', title: '3 idiomas', desc: 'Portugu\u00e9s, ingl\u00e9s y espa\u00f1ol con detecci\u00f3n autom\u00e1tica.' },
      ],
      ctaTitle: '¿Listo para empezar?',
      ctaDesc: 'Crea una sesión en segundos. Gratis, sin registro y sin instalar nada.',
    },
    faq: {
      metaTitle: 'Preguntas frecuentes',
      metaDescription: 'Respuestas a las dudas más comunes sobre Referee Lights: es gratis, uso sin internet, dispositivos compatibles, reglas IPF, transmisión en vivo y cómo reportar errores.',
      title: 'Preguntas frecuentes',
      subtitle: 'Lo que atletas y organizadores suelen preguntar antes de su primera competencia.',
      backHome: 'Volver al Inicio',
      seeAll: 'Ver todas las preguntas',
      items: [
        {
          q: '\u00bfQu\u00e9 es Referee Lights?',
          a: 'Referee Lights es un sistema gratuito de luces de arbitraje para competencias de Powerlifting que sigue las reglas de la IPF. Tres jueces votan desde su propio celular (GOOD LIFT o NO LIFT) y las luces aparecen en tiempo real en la pantalla del evento \u2014 sin paneles f\u00edsicos y sin instalar aplicaciones.',
        },
        {
          q: '\u00bfEs realmente gratis? \u00bfHay versi\u00f3n de pago o l\u00edmite de uso?',
          a: 'S\u00ed, Referee Lights es gratuito, sin registro, sin l\u00edmite de sesiones y sin versi\u00f3n premium. El c\u00f3digo fuente es p\u00fablico en GitHub y su uso es libre para atletas, clubes, federaciones y organizaciones sin fines de lucro; solo el uso comercial (revenderlo u ofrecerlo como servicio de pago) requiere autorizaci\u00f3n del autor.',
        },
        {
          q: '\u00bfNecesito instalar una aplicaci\u00f3n o crear una cuenta?',
          a: 'No. Todo funciona directo en el navegador: el organizador crea una sesi\u00f3n en refereelights.app y los jueces entran escaneando un c\u00f3digo QR con la c\u00e1mara del celular. No hay descarga de app, ni registro, ni configuraci\u00f3n.',
        },
        {
          q: '\u00bfFunciona sin internet (offline)?',
          a: 'S\u00ed. Adem\u00e1s de la versi\u00f3n en l\u00ednea, existe un paquete portable para Windows que ejecuta todo el sistema en la red Wi-Fi local sin internet \u2014 solo hay que extraer el ZIP y ejecutarlo. Es la opci\u00f3n recomendada para gimnasios con conexi\u00f3n inestable.',
        },
        {
          q: '\u00bfEn qu\u00e9 dispositivos funciona? \u00bfCu\u00e1les son los requisitos?',
          a: 'Funciona en cualquier celular, tablet o computadora con un navegador moderno (como Chrome, Edge o Firefox). Para el paquete offline se necesita una PC con Windows 10 o superior (64 bits) y una red Wi-Fi para conectar los dispositivos de los jueces.',
        },
        {
          q: '\u00bfC\u00f3mo funciona el sistema de luces blanca y roja?',
          a: 'Siguiendo las reglas de la IPF, cada uno de los tres jueces vota GOOD LIFT (luz blanca) o NO LIFT (luz roja), y las tres luces solo se revelan en el display cuando todos han votado. El sistema tambi\u00e9n incluye las tarjetas de penalizaci\u00f3n de la IPF (amarilla, roja y roja+amarilla) y el cron\u00f3metro oficial de 1 minuto.',
        },
        {
          q: '\u00bfSirve para otras federaciones adem\u00e1s de la IPF?',
          a: 'S\u00ed. El est\u00e1ndar de tres jueces con luces blanca y roja lo usa la mayor\u00eda de las federaciones de powerlifting, as\u00ed que el sistema sirve para cualquier evento que siga esa convenci\u00f3n. Las tarjetas de penalizaci\u00f3n siguen espec\u00edficamente el reglamento de la IPF.',
        },
        {
          q: '\u00bfCu\u00e1ntos dispositivos puedo conectar y c\u00f3mo funciona la sincronizaci\u00f3n?',
          a: 'Cada sesi\u00f3n conecta las tres consolas de jueces (izquierdo, central y derecho) m\u00e1s las pantallas de apoyo: panel admin, display principal, cron\u00f3metro y overlay de transmisi\u00f3n. Todas comparten el mismo estado en tiempo real v\u00eda WebSocket \u2014 un voto aparece al instante en todas las pantallas.',
        },
        {
          q: '\u00bfSe puede usar en competencias oficiales?',
          a: 'El sistema implementa el flujo completo de arbitraje de la IPF: tres jueces, luces, tarjetas de penalizaci\u00f3n y tiempos oficiales. Sin embargo, la homologaci\u00f3n del equipamiento en campeonatos oficiales depende de cada federaci\u00f3n \u2014 consulta con la organizaci\u00f3n de tu evento antes de usarlo.',
        },
        {
          q: '\u00bfC\u00f3mo muestro las luces en una transmisi\u00f3n en vivo (OBS)?',
          a: 'La pantalla de Leyenda/Chroma Key muestra las luces y el cron\u00f3metro sobre un fondo de color s\u00f3lido, lista para capturarse en OBS Studio o cualquier software de streaming. Agrega la p\u00e1gina como fuente de navegador (o captura la ventana) y aplica el filtro de chroma key para superponer las decisiones en tu transmisi\u00f3n.',
        },
        {
          q: '\u00bfC\u00f3mo reporto un error o pido una funcionalidad?',
          a: 'Abre un issue en el repositorio del proyecto en GitHub (github.com/jeanribas/referee-lights) describiendo el problema o la idea. El c\u00f3digo es p\u00fablico, as\u00ed que las sugerencias y contribuciones son bienvenidas.',
        },
        {
          q: '\u00bfPuedo instalar Referee Lights como aplicaci\u00f3n en el celular?',
          a: 'S\u00ed. Referee Lights es una web app instalable: desde el men\u00fa del navegador, usa "Agregar a la pantalla de inicio" (Android/iPhone) o "Instalar" (Chrome/Edge en computadora) y se abre en su propia ventana, como una aplicaci\u00f3n, con \u00edcono en la pantalla de inicio. No est\u00e1 en las tiendas de apps y sigue necesitando conexi\u00f3n con el servidor \u2014 por internet o por la red local en el modo Windows.',
        },
        {
          q: '\u00bfEn qu\u00e9 se diferencia Referee Lights de otros sistemas de luces?',
          a: 'Referee Lights es gratuito, funciona directo en el navegador sin instalar aplicaciones, no exige registro y su c\u00f3digo es p\u00fablico en GitHub. Re\u00fane en una sola plataforma las luces, las tarjetas IPF, el cron\u00f3metro, el modo offline para Windows y el overlay de chroma key para transmisiones \u2014 sin hardware dedicado y sin mensualidades.',
        },
      ],
    },
    windows: {
      metaTitle: 'Instalar en Windows',
      metaDescription: 'Gu\u00eda paso a paso para descargar y usar Referee Lights en Windows. Un solo archivo, sin instalar nada: descarga y abre.',
      title: 'C\u00f3mo usar en Windows',
      subtitle: 'Un solo archivo — descarga, abre y usa. Sin instalar nada.',
      backHome: 'Volver al inicio',
      steps: [
        { title: 'Descarga RefereeLights.exe', desc: 'Haz clic en "Descargar para Windows". RefereeLights.exe es la aplicaci\u00f3n completa: no hay que instalar ni extraer nada.' },
        { title: 'Abre el archivo', desc: 'Haz doble clic en RefereeLights.exe. La primera vez Windows puede avisar sobre un archivo descargado de internet: haz clic en "M\u00e1s informaci\u00f3n" y luego en "Ejecutar de todas formas".' },
        { title: 'Permite el acceso a la red', desc: 'Si Windows pregunta por el firewall, permite el acceso en redes privadas. As\u00ed los celulares de los \u00e1rbitros pueden conectarse.' },
        { title: 'Crea la sesi\u00f3n', desc: 'El navegador abre el panel solo. Crea una sesi\u00f3n y comparte los QR Codes con los \u00e1rbitros. El \u00edcono de Referee Lights queda junto al reloj de Windows: desde ah\u00ed reabres el panel, copias la direcci\u00f3n para los celulares o cierras la aplicaci\u00f3n.' },
        { title: 'Conecta los dispositivos', desc: 'Los \u00e1rbitros deben estar en la misma red Wi-Fi. Acceden por la IP de la m\u00e1quina (ej.: http://192.168.1.100:3000) escaneando el QR Code.' },
      ],
      requirements: {
        title: 'Requisitos',
        items: [
          'Windows 10 o superior (64 bits)',
          'No requiere instalaci\u00f3n — todo viene dentro de RefereeLights.exe',
          'Red Wi-Fi para conectar los dispositivos de los \u00e1rbitros',
          'Navegador moderno (Chrome, Edge, Firefox)',
        ],
      },
      troubleshooting: {
        title: 'Problemas comunes',
        items: [
          { q: 'Windows o el antivirus bloque\u00f3 el archivo', a: 'Haz clic en "M\u00e1s informaci\u00f3n" y luego en "Ejecutar de todas formas". Si el antivirus no deja abrirlo, usa la versi\u00f3n alternativa (zip): extr\u00e1ela y haz doble clic en Iniciar.cmd.' },
          { q: 'Los \u00e1rbitros no pueden conectarse', a: 'Verifica que todos est\u00e9n en la misma red Wi-Fi y que la red del equipo est\u00e9 como "Privada". En el \u00edcono de Referee Lights junto al reloj, usa "Permitir en el firewall" y "Direcci\u00f3n para celulares".' },
          { q: 'Error de puerto en uso', a: 'Si el puerto 3000 est\u00e1 ocupado, Referee Lights elige otro solo (3001, 3002...) y muestra la direcci\u00f3n correcta en el panel y en el \u00edcono junto al reloj.' },
          { q: 'D\u00f3nde quedan las salas y c\u00f3mo eliminar', a: 'Los datos quedan en %LOCALAPPDATA%\\RefereeLights y se mantienen entre actualizaciones. Para eliminar todo, usa "Eliminar datos y salir" en el \u00edcono junto al reloj y borra RefereeLights.exe.' },
          { q: 'C\u00f3mo actualizar', a: 'Cuando haya una versi\u00f3n nueva, el panel avisa. T\u00fa eliges cu\u00e1ndo actualizar — nunca durante una competencia en curso.' },
        ],
      },
      cta: 'Descargar para Windows',
      ctaAlt: 'Versi\u00f3n alternativa (zip)',
    },
    display: {
      metaDescription:
        'Pantalla IPF sincronizada con luces, cronómetro y avisos de intervalo controlados desde el panel Referee Lights.',
      menu: {
        optionsTitle: 'Opciones',
        quickActionsTitle: 'Acciones rápidas',
        fullscreenEnter: 'Entrar en pantalla completa',
        fullscreenExit: 'Salir de pantalla completa',
        goToAdmin: 'Ir al panel',
        showQr: 'Códigos QR de los árbitros',
        toggleButton: 'Abrir menú del display'
      },
      zoom: {
        label: 'Zoom',
        reset: 'Reiniciar'
      },
      wake: {
        title: 'Pantalla activa',
        keepAwake: 'Mantener pantalla activa',
        on: 'Pantalla mantenida encendida',
        off: 'OFF',
        warning: 'No se pudo activar el modo de mantener despierto. Toca la pantalla o inténtalo de nuevo.'
      },
      status: {
        waiting: 'Esperando la conexión...'
      },
      missing: {
        title: 'Pantalla no configurada',
        description: 'Agrega `roomId` y `pin` a la URL, por ejemplo `/display?roomId=ABCD&pin=1234`, o abre el panel de administración para generar una nueva sesión.',
        goToAdmin: 'Ir al panel'
      },
      interval: {
        primaryLabel: 'Inicio del flight',
        secondaryLabel: 'Cambiar aperturas',
        endMessage: 'CAMBIOS CERRADOS'
      },
      countdown: {
        primaryLabel: 'Intervalo programado',
        warningLabel: 'Aviso (-3 min)'
      }
    },
    admin: {
      metaDescription:
        'Administra las luces IPF: crea sesiones con PIN, genera códigos QR, ajusta temporizadores y monitorea a los árbitros en tiempo real.',
      header: {
        title: 'Administración de la plataforma',
        generatingLinks: 'Generando nuevos enlaces...'
      },
      timer: {
        title: 'Temporizador',
        start: 'Iniciar',
        stop: 'Detener',
        resetDefault: 'Reiniciar 1:00',
        minutesLabel: 'Minutos',
        set: 'Fijar'
      },
      interval: {
        title: 'Intervalo',
        configured: 'Configurado',
        remaining: 'Restante',
        hours: 'Horas',
        minutes: 'Minutos',
        seconds: 'Segundos',
        set: 'Fijar',
        start: 'Iniciar intervalo',
        pause: 'Pausar',
        reset: 'Reiniciar intervalo',
        showInterval: 'Mostrar intervalo',
        showLights: 'Mostrar luces',
        note: 'La pantalla mostrará una alerta roja tres minutos antes del final.',
        cancel: 'Cancelar',
        confirmStart: 'Confirmar inicio',
        confirmReset: 'Confirmar reinicio'
      },
      automation: {
        title: 'Automatización',
        active: 'Activa',
        inactive: 'Inactiva',
        description: 'Al revelar la decisión, envía la tecla a la ventana activa en la computadora del servidor.',
        keys: 'Teclas',
        enable: 'Activar automatización',
        disable: 'Desactivar',
        configTitle: 'Configurar teclas',
        validDecision: 'Decisión válida (Good Lift)',
        invalidDecision: 'Decisión inválida (No Lift)',
        pressKey: 'Presiona una tecla...'
      },
      preview: {
        waiting: 'Esperando estado...',
        showQr: 'Mostrar códigos QR',
        goToDisplay: 'Abrir display',
        goToLegend: 'Abrir leyenda',
        goToTimer: 'Abrir cronómetro'
      },
      qrMenu: {
        title: 'Compartir con árbitros',
        description: 'Escanea el código QR correspondiente para abrir la consola del árbitro en un dispositivo conectado a esta sesión.',
        regenerate: 'Generar nuevos enlaces',
        regenerating: 'Generando...',
        loading: 'Cargando códigos QR...',
        viewDescription: 'Para el árbitro que necesita volver a abrir su página: escanee el código QR de su posición. Los enlaces no cambian y nadie se desconecta.',
        localhostHint: 'Esta pantalla está abierta como "localhost": el celular no accede a esa dirección. Abra esta pantalla desde el enlace del panel (dirección de red) para que el QR funcione.',
        loadError: 'No se pudieron cargar los códigos QR. Verifique la conexión e inténtelo de nuevo.',
        ariaLabel: 'Códigos QR para árbitros',
        targets: {
          left: 'Árbitro izquierdo',
          center: 'Árbitro central',
          right: 'Árbitro derecho'
        },
        shortTargets: {
          left: 'Izquierdo',
          center: 'Central',
          right: 'Derecho'
        }
      },
      roomSetup: {
        title: 'Configurar plataforma',
        description: 'Gestiona las sesiones del sistema en un solo lugar. Crea nuevas salas con PIN administrativo y códigos QR exclusivos, o recupera una sesión existente introduciendo su identificador y PIN correspondiente.',
        create: {
          title: 'Crear nueva sesión',
          description: 'Configura una sala completa en segundos con PIN administrativo, códigos QR para cada árbitro y un enlace de display listo para compartir.',
          steps: [
            'Comparte el PIN con el equipo y distribuye automáticamente los códigos QR generados para cada árbitro.',
            'Inicia la sesión con temporizadores, tarjetas y votos sincronizados en tiempo real desde este panel.'
          ],
          cta: 'Generar sesión ahora',
          note: 'Los tokens pueden rotarse cuando sea necesario después de crear la sala.'
        },
        join: {
          title: 'Ingresar a sesión existente',
          description: 'Introduce los datos de la sala para reconectar este panel a una sesión activa y continuar la operación sin interrupciones.',
          roomLabel: 'Sala',
          roomPlaceholder: 'ABCD',
          pinLabel: 'PIN administrativo',
          pinPlaceholder: '1234',
          submit: 'Entrar al panel'
        }
      },
      fullPage: {
        loadingTitle: 'Cargando',
        loadingDescription: 'Preparando panel...',
        connectingTitle: 'Conectando',
        connectingDescription: 'Sincronizando datos de la plataforma...'
      },
      footer: {
        openSource: 'Open Source',
        hostedBy: 'Desarrollado y alojado por',
        hostedByName: 'assist.com.br'
      }
    },
    legend: {
      metaDescription:
        'Pantalla complementaria con temporizador personalizable, fondo chroma key y estado en tiempo real para transmisiones IPF.',
      title: 'Leyenda',
      statusRoomSuffix: ' - Sala {roomId}',
      missingCredentials: 'Agrega `roomId` y `pin` a la URL para conectar.',
      errorPrefix: 'Error:',
      buttons: {
        paletteOpen: 'Color de fondo',
        paletteClose: 'Cerrar color',
        placeholdersShow: 'Mostrar marcos',
        placeholdersHide: 'Ocultar marcos',
        frameShow: 'Mostrar línea',
        frameHide: 'Ocultar línea',
        digits: 'Dígitos: {mode}',
        wake: 'Pantalla activa: {state}'
      },
      digitsModes: {
        hhmmss: 'HH:MM:SS',
        mmss: 'MM:SS'
      },
      palette: {
        title: 'Paleta rápida',
        selectColor: 'Seleccionar {color}',
        customColor: 'Color personalizado',
        timerColor: 'Cronómetro',
        transparentBackground: 'Fondo transparente'
      },
      share: {
        title: 'Enlace para compartir',
        description: 'Abre este enlace para mostrar solo la leyenda, sin controles de configuración.',
        save: 'Guardar',
        saved: 'Guardado',
        copy: 'Copiar enlace',
        copied: 'Copiado'
      },
      wakeWarning: 'No se pudo activar el modo de mantener despierto. Toca la pantalla o inténtalo de nuevo.',
      waiting: 'Esperando la conexión...',
      done: {
        button: 'Concluir',
        unsaved: 'Cambios sin guardar',
        title: 'Leyenda lista',
        saved: 'Configuración guardada para todas las leyendas de esta sala.',
        obsLabel: 'Enlace para OBS',
        obsHint: 'En OBS, agrega una Fuente de Navegador con este enlace.',
        useWindow: 'Usar esta ventana',
        useWindowHint: 'Esta ventana se convierte en la versión limpia, sin controles, para capturar.',
        back: 'Volver a editar'
      }
    },
    referee: {
      metaDescription:
        'Consola móvil para árbitros con botones GOOD/NO LIFT, tarjetas IPF y sincronización en tiempo real con el panel Referee Lights.',
      selectorTitle: 'Selecciona la posición del árbitro',
      invalidRoute: 'Ruta de árbitro inválida.',
      center: {
        title: 'Árbitro central',
        timeLabel: 'Tiempo oficial',
        start: 'Iniciar',
        pause: 'Pausar',
        reset: 'Reiniciar',
        valid: 'GOOD LIFT'
      },
      side: {
        leftTitle: 'Árbitro lateral izquierdo',
        rightTitle: 'Árbitro lateral derecho',
        valid: 'GOOD LIFT'
      },
      missing: {
        title: 'Consola no disponible',
        description: 'Usa un código QR actualizado para acceder a `{judge}` con una sala y token válidos.'
      }
    },
  }
};

export function getMessages(locale: string | undefined): Messages {
  if (locale && APP_LOCALES.includes(locale as AppLocale)) {
    return MESSAGES[locale as AppLocale];
  }
  return MESSAGES[DEFAULT_LOCALE];
}
