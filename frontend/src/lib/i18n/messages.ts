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
  help: {
    button: string;
    title: string;
    steps: string[];
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
};

export type Messages = {
  common: CommonMessages;
  home: HomeMessages;
  windows: WindowsMessages;
  display: DisplayMessages;
  admin: AdminMessages;
  legend: LegendMessages;
  referee: RefereeMessages;
};

const MESSAGES: Record<AppLocale, Messages> = {
  'pt-BR': {
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
    windows: {
      metaTitle: 'Instalar no Windows',
      metaDescription: 'Guia passo a passo para baixar e rodar o Referee Lights no Windows. Sem instalar nada — basta extrair o ZIP e clicar.',
      title: 'Como usar no Windows',
      subtitle: 'Pacote portátil — extraia, clique e use. Sem instalar nada.',
      backHome: 'Voltar para a Home',
      steps: [
        { title: 'Baixe o pacote', desc: 'Acesse a página de Releases no GitHub e baixe o arquivo referee-lights-windows.zip da versão mais recente.' },
        { title: 'Extraia o ZIP', desc: 'Clique com o botão direito no arquivo baixado e escolha "Extrair tudo". Escolha uma pasta fácil de encontrar, como a Área de Trabalho ou C:\\referee-lights.' },
        { title: 'Execute o Iniciar.cmd', desc: 'Abra a pasta extraída e dê dois cliques no arquivo Iniciar.cmd. Uma janela do servidor vai abrir minimizada. Não feche essa janela durante o uso.' },
        { title: 'Abra no navegador', desc: 'Após alguns segundos, abra o navegador e acesse http://localhost:3000. O painel admin vai aparecer. Crie uma sessão e distribua os QR Codes para os árbitros.' },
        { title: 'Conecte os dispositivos', desc: 'Os árbitros devem estar na mesma rede WiFi. Eles acessam pelo IP da máquina (ex: http://192.168.1.100:3000) escaneando o QR Code.' },
      ],
      requirements: {
        title: 'Requisitos',
        items: [
          'Windows 10 ou superior (64 bits)',
          'Nenhuma instalação necessária — Node.js já vem incluso no pacote',
          'Rede WiFi para conectar os dispositivos dos árbitros',
          'Navegador moderno (Chrome, Edge, Firefox)',
        ],
      },
      troubleshooting: {
        title: 'Problemas comuns',
        items: [
          { q: 'O Windows bloqueou o Iniciar.cmd', a: 'Clique em "Mais informações" e depois em "Executar assim mesmo". É normal o Windows alertar sobre arquivos baixados da internet.' },
          { q: 'A página não abre no navegador', a: 'Espere 10 a 15 segundos após executar o Iniciar.cmd. Se ainda não funcionar, verifique se a janela do servidor mostrou algum erro.' },
          { q: 'Os árbitros não conseguem conectar', a: 'Verifique se todos estão na mesma rede WiFi. Use o IP da máquina (mostrado no painel admin) em vez de localhost.' },
          { q: 'Erro de porta em uso', a: 'Feche outras aplicações que possam estar usando a porta 3000, ou edite PORT no arquivo server\\.env.' },
        ],
      },
      cta: 'Baixar para Windows',
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
      help: {
        button: 'Como usar no OBS',
        title: 'Como usar no OBS',
        steps: [
          'Ajuste aqui a aparência (cor de fundo, molduras, linha, dígitos) e clique em Salvar — vale para todas as legendas desta sala.',
          'No OBS, adicione uma Fonte de Navegador com o endereço desta janela (copie da barra de endereço do navegador).',
          'Na cena, recorte a barra de cima (Alt + arrastar a borda da fonte).',
          'Para ajustar dentro do OBS: clique com o botão direito na fonte → Interagir, mude o que quiser e clique em Salvar.'
        ]
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
    windows: {
      metaTitle: 'Install on Windows',
      metaDescription: 'Step-by-step guide to download and run Referee Lights on Windows. No installation needed — just extract the ZIP and click.',
      title: 'How to use on Windows',
      subtitle: 'Portable package — extract, click, and use. No installation needed.',
      backHome: 'Back to Home',
      steps: [
        { title: 'Download the package', desc: 'Go to the GitHub Releases page and download the referee-lights-windows.zip file from the latest version.' },
        { title: 'Extract the ZIP', desc: 'Right-click the downloaded file and choose "Extract All". Pick an easy-to-find folder like the Desktop or C:\\referee-lights.' },
        { title: 'Run Iniciar.cmd', desc: 'Open the extracted folder and double-click the Iniciar.cmd file. A server window will open minimized. Do not close it while in use.' },
        { title: 'Open in the browser', desc: 'After a few seconds, open your browser and go to http://localhost:3000. The admin panel will appear. Create a session and share the QR Codes with the referees.' },
        { title: 'Connect the devices', desc: 'Referees must be on the same WiFi network. They access via the machine\'s IP address (e.g., http://192.168.1.100:3000) by scanning the QR Code.' },
      ],
      requirements: {
        title: 'Requirements',
        items: [
          'Windows 10 or later (64-bit)',
          'No installation needed — Node.js is included in the package',
          'WiFi network to connect referee devices',
          'Modern browser (Chrome, Edge, Firefox)',
        ],
      },
      troubleshooting: {
        title: 'Common issues',
        items: [
          { q: 'Windows blocked Iniciar.cmd', a: 'Click "More info" then "Run anyway". This is normal for files downloaded from the internet.' },
          { q: 'The page won\'t open in the browser', a: 'Wait 10 to 15 seconds after running Iniciar.cmd. If it still doesn\'t work, check the server window for errors.' },
          { q: 'Referees can\'t connect', a: 'Make sure everyone is on the same WiFi network. Use the machine\'s IP (shown in the admin panel) instead of localhost.' },
          { q: 'Port already in use error', a: 'Close other applications using port 3000, or edit PORT in the server\\.env file.' },
        ],
      },
      cta: 'Download for Windows',
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
      help: {
        button: 'How to use in OBS',
        title: 'How to use in OBS',
        steps: [
          'Adjust the look here (background color, frames, line, digits) and click Save — it applies to every legend in this room.',
          "In OBS, add a Browser Source with this window's address (copy it from the browser's address bar).",
          'In the scene, crop out the top bar (Alt + drag the source edge).',
          'To adjust inside OBS: right-click the source → Interact, change what you need and click Save.'
        ]
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
      ctaTitle: '\u00bfListo para empezar?',
      ctaDesc: 'Crea una sesi\u00f3n en segundos. Gratis, sin registro y sin instalar nada.',
    },
    windows: {
      metaTitle: 'Instalar en Windows',
      metaDescription: 'Gu\u00eda paso a paso para descargar y ejecutar Referee Lights en Windows. Sin instalar nada.',
      title: 'C\u00f3mo usar en Windows',
      subtitle: 'Paquete portable \u2014 extrae, haz clic y usa. Sin instalar nada.',
      backHome: 'Volver al Inicio',
      steps: [
        { title: 'Descarga el paquete', desc: 'Ve a la p\u00e1gina de Releases en GitHub y descarga el archivo referee-lights-windows.zip de la versi\u00f3n m\u00e1s reciente.' },
        { title: 'Extrae el ZIP', desc: 'Haz clic derecho en el archivo descargado y elige "Extraer todo". Elige una carpeta f\u00e1cil de encontrar.' },
        { title: 'Ejecuta Iniciar.cmd', desc: 'Abre la carpeta extra\u00edda y haz doble clic en Iniciar.cmd. Se abrir\u00e1 una ventana del servidor minimizada. No la cierres.' },
        { title: 'Abre en el navegador', desc: 'Despu\u00e9s de unos segundos, abre el navegador y ve a http://localhost:3000. Crea una sesi\u00f3n y comparte los QR Codes.' },
        { title: 'Conecta los dispositivos', desc: 'Los jueces deben estar en la misma red WiFi. Acceden por la IP de la m\u00e1quina escaneando el QR Code.' },
      ],
      requirements: {
        title: 'Requisitos',
        items: [
          'Windows 10 o superior (64 bits)',
          'No se necesita instalar nada \u2014 Node.js ya viene incluido',
          'Red WiFi para conectar los dispositivos de los jueces',
          'Navegador moderno (Chrome, Edge, Firefox)',
        ],
      },
      troubleshooting: {
        title: 'Problemas comunes',
        items: [
          { q: 'Windows bloque\u00f3 Iniciar.cmd', a: 'Haz clic en "M\u00e1s informaci\u00f3n" y luego en "Ejecutar de todos modos".' },
          { q: 'La p\u00e1gina no abre', a: 'Espera 10-15 segundos. Revisa si la ventana del servidor muestra errores.' },
          { q: 'Los jueces no pueden conectarse', a: 'Verifica que todos est\u00e9n en la misma red WiFi. Usa la IP de la m\u00e1quina.' },
          { q: 'Error de puerto en uso', a: 'Cierra otras aplicaciones en el puerto 3000.' },
        ],
      },
      cta: 'Descargar para Windows',
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
      help: {
        button: 'Cómo usar en OBS',
        title: 'Cómo usar en OBS',
        steps: [
          'Ajusta aquí la apariencia (color de fondo, marcos, línea, dígitos) y haz clic en Guardar — vale para todas las leyendas de esta sala.',
          'En OBS, agrega una Fuente de Navegador con la dirección de esta ventana (cópiala de la barra de direcciones del navegador).',
          'En la escena, recorta la barra superior (Alt + arrastrar el borde de la fuente).',
          'Para ajustar dentro de OBS: clic derecho en la fuente → Interactuar, cambia lo que quieras y haz clic en Guardar.'
        ]
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
