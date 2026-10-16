// Meet Ayio - ajustes da interface (anexado ao config.js gerado no boot)

// O nome da sala vem do cliente (SeuCartorio etc.); nao mostrar sugestoes.
config.enableWelcomePage = false;
config.enableClosePage = false;

// Gravacao so pelo servico (Jibri), nunca local no navegador.
config.localRecording = { disable: true };

// Sem links para apps moveis da 8x8/Jitsi.
config.disableDeepLinking = true;

// Sem envio de estatisticas para servidores externos.
config.analytics = { disabled: true };
config.callStatsID = undefined;
config.disableThirdPartyRequests = true;
config.gravatar = { disabled: true };
