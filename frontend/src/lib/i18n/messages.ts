import { APP_LOCALES, DEFAULT_LOCALE, type AppLocale } from './config';

type CommonMessages = {
  labels: {
    room: string;
    adminPinShort: string;
    adminPinLong: string;
    status: string;
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
    ariaLabel: string;
    targets: {
      left: string;
      center: string;
      right: string;
    };
  };
  roomSetup: {
    badge: string;
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
};

export type Messages = {
  common: CommonMessages;
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
    common: {
      labels: {
        room: 'Sala',
        adminPinShort: 'PIN admin',
        adminPinLong: 'PIN Administrativo',
        status: 'Status'
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
      metaDescription: 'Guia passo a passo para baixar e rodar o Referee Lights no Windows. Sem instalar nada — basta extrair o ZIP e clicar.',
      title: 'Como usar no Windows',
      subtitle: 'Pacote portátil — extraia, clique e use. Sem instalar nada.',
      backHome: 'Voltar para a Home',
      steps: [
        { title: 'Baixe o pacote', desc: 'Acesse a página de Releases no GitHub e baixe o arquivo referee-lights-windows.zip da versão mais recente.' },
        { title: 'Extraia o ZIP', desc: 'Clique com o botão direito no arquivo baixado e escolha "Extrair tudo". Escolha uma pasta fácil de encontrar, como a Área de Trabalho ou C:\\referee-lights.' },
        { title: 'Execute o Iniciar.cmd', desc: 'Abra a pasta extraída e dê dois cliques no arquivo Iniciar.cmd. Duas janelas de terminal vão abrir — uma para o servidor e outra para o frontend. Não feche essas janelas.' },
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
          { q: 'A página não abre no navegador', a: 'Espere 10 a 15 segundos após executar o Iniciar.cmd. Se ainda não funcionar, verifique se as janelas de terminal não mostraram erros.' },
          { q: 'Os árbitros não conseguem conectar', a: 'Verifique se todos estão na mesma rede WiFi. Use o IP da máquina (mostrado no painel admin) em vez de localhost.' },
          { q: 'Erro de porta em uso', a: 'Feche outras aplicações que possam estar usando as portas 3000 ou 3333, ou edite o arquivo .env para mudar as portas.' },
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
        toggleButton: 'Alternar menu do display'
      },
      zoom: {
        label: 'Zoom',
        reset: 'Resetar'
      },
      wake: {
        title: 'Tela ativa',
        keepAwake: 'Manter tela ativa',
        on: 'ON',
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
        note: 'O display exibirá um aviso em vermelho três minutos antes do término.'
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
        ariaLabel: 'QR Codes para árbitros',
        targets: {
          left: 'Árbitro Esquerdo',
          center: 'Árbitro Central',
          right: 'Árbitro Direito'
        }
      },
      roomSetup: {
        badge: 'Painel Administrativo',
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
      waiting: 'Aguardando conexão...'
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
        adminPinLong: 'Admin PIN',
        status: 'Status'
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
      metaDescription: 'Step-by-step guide to download and run Referee Lights on Windows. No installation needed — just extract the ZIP and click.',
      title: 'How to use on Windows',
      subtitle: 'Portable package — extract, click, and use. No installation needed.',
      backHome: 'Back to Home',
      steps: [
        { title: 'Download the package', desc: 'Go to the GitHub Releases page and download the referee-lights-windows.zip file from the latest version.' },
        { title: 'Extract the ZIP', desc: 'Right-click the downloaded file and choose "Extract All". Pick an easy-to-find folder like the Desktop or C:\\referee-lights.' },
        { title: 'Run Iniciar.cmd', desc: 'Open the extracted folder and double-click the Iniciar.cmd file. Two terminal windows will open — one for the server and one for the frontend. Do not close them.' },
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
          { q: 'The page won\'t open in the browser', a: 'Wait 10 to 15 seconds after running Iniciar.cmd. If it still doesn\'t work, check the terminal windows for errors.' },
          { q: 'Referees can\'t connect', a: 'Make sure everyone is on the same WiFi network. Use the machine\'s IP (shown in the admin panel) instead of localhost.' },
          { q: 'Port already in use error', a: 'Close other applications using ports 3000 or 3333, or edit the .env file to change the ports.' },
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
        toggleButton: 'Toggle display menu'
      },
      zoom: {
        label: 'Zoom',
        reset: 'Reset'
      },
      wake: {
        title: 'Screen awake',
        keepAwake: 'Keep screen awake',
        on: 'ON',
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
        note: 'The display will show a red warning three minutes before the end.'
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
        ariaLabel: 'QR Codes for referees',
        targets: {
          left: 'Left Referee',
          center: 'Center Referee',
          right: 'Right Referee'
        }
      },
      roomSetup: {
        badge: 'Admin Panel',
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
      waiting: 'Waiting for connection...'
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
        adminPinLong: 'PIN administrativo',
        status: 'Estado'
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
      metaDescription: 'Gu\u00eda paso a paso para descargar y ejecutar Referee Lights en Windows. Sin instalar nada.',
      title: 'C\u00f3mo usar en Windows',
      subtitle: 'Paquete portable \u2014 extrae, haz clic y usa. Sin instalar nada.',
      backHome: 'Volver al Inicio',
      steps: [
        { title: 'Descarga el paquete', desc: 'Ve a la p\u00e1gina de Releases en GitHub y descarga el archivo referee-lights-windows.zip de la versi\u00f3n m\u00e1s reciente.' },
        { title: 'Extrae el ZIP', desc: 'Haz clic derecho en el archivo descargado y elige "Extraer todo". Elige una carpeta f\u00e1cil de encontrar.' },
        { title: 'Ejecuta Iniciar.cmd', desc: 'Abre la carpeta extra\u00edda y haz doble clic en Iniciar.cmd. Se abrir\u00e1n dos ventanas de terminal. No las cierres.' },
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
          { q: 'La p\u00e1gina no abre', a: 'Espera 10-15 segundos. Revisa si las ventanas de terminal muestran errores.' },
          { q: 'Los jueces no pueden conectarse', a: 'Verifica que todos est\u00e9n en la misma red WiFi. Usa la IP de la m\u00e1quina.' },
          { q: 'Error de puerto en uso', a: 'Cierra otras aplicaciones en los puertos 3000 o 3333.' },
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
        toggleButton: 'Abrir menú del display'
      },
      zoom: {
        label: 'Zoom',
        reset: 'Reiniciar'
      },
      wake: {
        title: 'Pantalla activa',
        keepAwake: 'Mantener pantalla activa',
        on: 'ON',
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
        note: 'La pantalla mostrará una alerta roja tres minutos antes del final.'
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
        ariaLabel: 'Códigos QR para árbitros',
        targets: {
          left: 'Árbitro izquierdo',
          center: 'Árbitro central',
          right: 'Árbitro derecho'
        }
      },
      roomSetup: {
        badge: 'Panel administrativo',
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
      waiting: 'Esperando la conexión...'
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
