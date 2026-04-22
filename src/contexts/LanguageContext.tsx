import { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'en' | 'es';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  translateOutcome: (outcome: string) => string;
  translateCategory: (category: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    'nav.marketRadar': 'Positions Radar',
    'nav.walletIntel': 'Wallet Intel',
    'nav.agents': 'PolyAgents',
    'nav.botBuilder': 'Bot Builder',
    'nav.botMonitor': 'Bot Monitor',
    'nav.settings': 'Settings',
    
    // Settings
    'settings.title': 'Terminal Settings',
    'settings.subtitle': 'Customize your terminal experience and preferences',
    'settings.appearance': 'Appearance',
    'settings.appearanceDesc': 'Customize how the terminal looks and feels',
    'settings.darkMode': 'Dark Mode',
    'settings.lightModeOn': 'Light mode is currently active',
    'settings.darkModeOn': 'Dark mode is currently active',
    'settings.language': 'Language',
    'settings.languageDesc': 'Choose your preferred interface language',
    'settings.dataManagement': 'Data Management',
    'settings.dataManagementDesc': 'Control how agent predictions and sentiment data are stored',
    'settings.maxDataAge': 'Maximum Data Age',
    'settings.maxDataAgeDesc': 'Data older than this will be marked as stale and eligible for cleanup',
    'settings.autoCleanup': 'Auto Cleanup',
    'settings.autoCleanupDesc': 'Automatically remove expired data in the background',
    'settings.cleanupNow': 'Clean Up Now',
    'settings.notifications': 'Notifications',
    'settings.notificationsDesc': 'Configure alerts for market movements and signals',
    'settings.enableNotifications': 'Enable Notifications',
    'settings.notificationsHint': 'Receive real-time alerts for whale activity and price swings',
    'settings.agentConfig': 'AI Agent Configuration',
    'settings.agentConfigDesc': 'Configure your AI trading agent behavior and preferences',
    // Agents
    'agents.title': 'Polymarket Agents',
    'agents.subtitle': 'AI-powered market analysis',
    'agents.analyzer': 'Analyzer',
    'agents.config': 'Config',
    'agents.history': 'History',
    'agents.selectMarket': 'Select Market',
    'agents.scanAll': 'Scan All',
    'agents.aiAnalysis': 'AI Analysis',
    'agents.analyze': 'Analyze',
    'agents.selectMarketToAnalyze': 'Select a market to analyze with AI',
    'agents.analyzing': 'Analyzing market...',
    'agents.clickAnalyze': 'Click Analyze to get AI insights',
    'agents.analysisComplete': 'Analysis Complete',
    'agents.recommendation': 'Recommendation',
    'agents.analysisError': 'Analysis Failed',
    'agents.scanComplete': 'Scan Complete',
    'agents.marketsScanned': 'Markets scanned',
    'agents.scanError': 'Scan Failed',
    'agents.noMarkets': 'No markets available',
    'agents.predictionHistory': 'Prediction History',
    'agents.noPredictions': 'No predictions yet',
    'agents.startAnalyzing': 'Start analyzing markets to see your history here',
    'agents.configTitle': 'Agent Configuration',
    'agents.configDescription': 'Configure your AI trading agent settings',
    'agents.agentName': 'Agent Name',
    'agents.model': 'AI Model',
    'agents.categories': 'Categories to Analyze',
    'agents.riskTolerance': 'Risk Tolerance',
    'agents.conservative': 'Conservative',
    'agents.medium': 'Medium',
    'agents.aggressive': 'Aggressive',
    'agents.analysisDepth': 'Analysis Depth',
    'agents.quick': 'Quick',
    'agents.balanced': 'Balanced',
    'agents.deep': 'Deep',
    'agents.saveConfig': 'Save Configuration',
    'agents.configSaved': 'Configuration Saved',
    'agents.configSavedDesc': 'Your agent settings have been updated',
    'agents.configError': 'Failed to save configuration',
    'agents.sentiment': 'Sentiment',
    'agents.sentimentAnalysis': 'Sentiment Analysis',
    'agents.analyzingSentiment': 'Analyzing sentiment...',
    'agents.sentimentAnalyzed': 'Sentiment Analyzed',
    'agents.clickAnalyzeSentiment': 'Click Analyze to scan news and social sentiment',
    'agents.newsSummary': 'News Summary',
    'agents.sources': 'Sources',
    'agents.sentimentHistory': 'Sentiment History',
    'agents.noSentimentHistory': 'No sentiment data yet',
    'agents.configureAgent': 'Configure Agent',
    // Header
    'header.search': 'Search markets, wallets...',
    'header.live': 'Live',
    'header.disconnected': 'Disconnected',
    
    // Market Radar
    'radar.title': 'Positions Radar',
    'radar.subtitle': 'Real-time market overview',
    'radar.volume24h': '24h Volume',
    'radar.activeMarkets': 'Active Markets',
    'radar.topMover': 'Top Mover (24h)',
    'radar.avgLiquidity': 'Avg Liquidity',
    'radar.showing': 'Showing',
    'radar.markets': 'markets',
    'radar.loadMore': 'Load more markets',
    'radar.noMarkets': 'No markets available yet.',
    'radar.failedLoad': 'Failed to load markets',
    'radar.retry': 'Retry',
    'radar.loading': 'Loading...',
    
    // Table headers
    'table.market': 'Market',
    'table.price': 'Price',
    'table.1h': '1h',
    'table.24h': '24h',
    'table.volume': 'Volume (24h)',
    'table.liquidity': 'Liquidity',
    'table.score': 'Score',
    'table.ends': 'Ends',
    
    // Filters
    'filter.all': 'All',
    'filter.topMovers': 'Top Movers',
    'filter.volume': 'Volume',
    'filter.liquidity': 'Liquidity',
    'filter.score': 'Score',
    'filter.newest': 'Newest',
    
    // Categories
    'cat.politics': 'Politics',
    'cat.sports': 'Sports',
    'cat.crypto': 'Crypto',
    'cat.economics': 'Economics',
    'cat.world': 'World',
    'cat.entertainment': 'Entertainment',
    'cat.other': 'Other',
    
    // Wallet Intel
    'wallet.title': 'Wallet Intel',
    'wallet.subtitle': 'Track smart money movements',
    
    // Bot Builder
    'bot.builder.title': 'Bot Builder',
    'bot.builder.subtitle': 'Configure your trading bot',
    
    // Bot Monitor
    'bot.monitor.title': 'Bot Monitor',
    'bot.monitor.subtitle': 'Track bot performance',
    
    // Common
    'common.unknown': 'Unknown',
    'common.noData': 'No data',
    'common.loading': 'Loading...',
    'common.active': 'Active',
    'common.closed': 'Closed',
    'common.showMore': 'Show more',
    'common.showLess': 'Show less',
    
    // Wallet Intel
    'walletIntel.watchlist': 'Watchlist',
    'walletIntel.addWallet': 'Add Wallet',
    'walletIntel.tracking': 'Tracking',
    'walletIntel.wallets': 'wallets',
    'walletIntel.noWallets': 'No wallets being tracked',
    'walletIntel.totalTrackedVolume': 'Total Tracked Volume',
    'walletIntel.watchedWallets': 'Watched Wallets',
    'walletIntel.highActivity': 'high activity',
    'walletIntel.unusualSignals': 'Unusual Signals',
    'walletIntel.last24h': 'Last 24h',
    'walletIntel.avgWinRate': 'Avg Win Rate',
    'walletIntel.walletActivity': 'Wallet Activity',
    'walletIntel.allActivityFeed': 'All Activity Feed',
    'walletIntel.noActivity': 'No activity recorded yet',
    'walletIntel.24hVol': '24h Vol',
    'walletIntel.winRate': 'Win Rate',
    'walletIntel.active': 'Active',
    'walletIntel.unknownWallet': 'Unknown Wallet',
    'walletIntel.totalVolume': 'Total Volume',
    'walletIntel.7dVolume': '7d Volume',
    'walletIntel.avgTrade': 'Avg Trade',
    'walletIntel.markets': 'Markets',
    'walletIntel.pnl': 'PnL',
    'walletIntel.unusual': 'Unusual',
    'walletIntel.wallet': 'Wallet',
    'walletIntel.unknownMarket': 'Unknown market',
    
    // Market Detail
    'marketDetail.title': 'Market Detail',
    'marketDetail.subtitle': 'Trades, orderbook and wallet activity',
    'marketDetail.selectMarket': 'Select a market',
    'marketDetail.goToRadar': 'Go to Market Radar and click on a market to see its details.',
    'marketDetail.addToBot': 'Add to Bot',
    'marketDetail.orderBook': 'Order Book',
    'marketDetail.depth': 'Depth',
    'marketDetail.netFlow1h': 'Net Flow (1h)',
    'marketDetail.netFlow': 'Net Flow',
    'marketDetail.tradesHistory': 'Trades',
    'marketDetail.recentTrades': 'Recent Trades',
    'marketDetail.noTradesInPeriod': 'No trades in this period',
    'marketDetail.loadingTrades': 'Loading trades...',
    'marketDetail.noTrades': 'No trades saved for this market yet.',
    'marketDetail.relatedNews': 'Related News',
    'marketDetail.loadingNews': 'Loading news...',
    'marketDetail.noNews': 'No recent news',
    'marketDetail.marketStats': 'Market Stats',
    'marketDetail.24hVolume': '24h Volume',
    'marketDetail.liquidity': 'Liquidity',
    'marketDetail.liquidityScore': 'Liquidity Score',
    'marketDetail.endDate': 'End Date',
    'marketDetail.fetchingFresh': 'Fetching fresh trades...',
    
    // Trades
    'trade.buy': 'BUY',
    'trade.sell': 'SELL',
    'trade.whale': 'WHALE',
    'trade.big': 'BIG',
    
    // Orderbook
    'orderbook.loading': 'Loading orderbook...',
    'orderbook.retry': 'Retry',
    'orderbook.noOrders': 'No orders available',
    'orderbook.price': 'Price',
    'orderbook.size': 'Size',
    'orderbook.spread': 'Spread',
    'orderbook.updated': 'Updated',
    'orderbook.refresh': 'Refresh',
    'orderbook.lowLiquidity': 'Low liquidity',
    
    // Depth Chart
    'depthChart.loading': 'Loading depth chart...',
    'depthChart.noData': 'No depth data',
    'depthChart.bids': 'Bids',
    'depthChart.asks': 'Asks',
    'depthChart.price': 'Price',
    'depthChart.combined': 'Combined Depth',
    
    // Wallet Detail Panel
    'wallet.details': 'Wallet Details',
    'wallet.copyAddress': 'Copy address',
    'wallet.viewOnPolygonscan': 'View on Polygonscan',
    'wallet.watch': 'Watch',
    'wallet.unwatch': 'Unwatch',
    'wallet.volume24h': '24h Volume',
    'wallet.volume7d': '7d Volume',
    'wallet.totalVolume': 'Total Volume',
    'wallet.avgTradeSize': 'Avg Trade Size',
    'wallet.marketsTraded': 'Markets Traded',
    'wallet.winRate': 'Win Rate',
    'wallet.noData': 'No wallet data available',
    'wallet.recentActivity': 'Recent Activity',
    'wallet.noActivity': 'No activity recorded',
    'wallet.unusual': 'Unusual',
    'wallet.unknownMarket': 'Unknown market',
  },
  es: {
    // Navigation
    'nav.marketRadar': 'Radar de Posiciones',
    'nav.walletIntel': 'Inteligencia de Wallets',
    'nav.agents': 'PolyAgents',
    'nav.botBuilder': 'Constructor de Bot',
    'nav.botMonitor': 'Monitor de Bot',
    'nav.settings': 'Ajustes',
    
    // Settings
    'settings.title': 'Ajustes del Terminal',
    'settings.subtitle': 'Personaliza tu experiencia y preferencias del terminal',
    'settings.appearance': 'Apariencia',
    'settings.appearanceDesc': 'Personaliza cómo se ve y se siente el terminal',
    'settings.darkMode': 'Modo Oscuro',
    'settings.lightModeOn': 'El modo claro está activo',
    'settings.darkModeOn': 'El modo oscuro está activo',
    'settings.language': 'Idioma',
    'settings.languageDesc': 'Elige tu idioma preferido para la interfaz',
    'settings.dataManagement': 'Gestión de Datos',
    'settings.dataManagementDesc': 'Controla cómo se almacenan las predicciones y datos de sentimiento',
    'settings.maxDataAge': 'Antigüedad Máxima',
    'settings.maxDataAgeDesc': 'Los datos más antiguos se marcarán como obsoletos y serán elegibles para limpieza',
    'settings.autoCleanup': 'Limpieza Automática',
    'settings.autoCleanupDesc': 'Eliminar automáticamente datos expirados en segundo plano',
    'settings.cleanupNow': 'Limpiar Ahora',
    'settings.notifications': 'Notificaciones',
    'settings.notificationsDesc': 'Configura alertas para movimientos del mercado y señales',
    'settings.enableNotifications': 'Activar Notificaciones',
    'settings.notificationsHint': 'Recibe alertas en tiempo real sobre ballenas y cambios de precio',
    'settings.agentConfig': 'Configuración del Agente IA',
    'settings.agentConfigDesc': 'Configura el comportamiento y preferencias de tu agente de trading IA',

    // Agents
    'agents.title': 'Polymarket Agents',
    'agents.subtitle': 'Análisis de mercados con IA',
    'agents.analyzer': 'Analizador',
    'agents.config': 'Config',
    'agents.history': 'Historial',
    'agents.selectMarket': 'Seleccionar Mercado',
    'agents.scanAll': 'Escanear Todo',
    'agents.aiAnalysis': 'Análisis IA',
    'agents.analyze': 'Analizar',
    'agents.selectMarketToAnalyze': 'Selecciona un mercado para analizar con IA',
    'agents.analyzing': 'Analizando mercado...',
    'agents.clickAnalyze': 'Haz clic en Analizar para obtener insights',
    'agents.analysisComplete': 'Análisis Completo',
    'agents.recommendation': 'Recomendación',
    'agents.analysisError': 'Error en Análisis',
    'agents.scanComplete': 'Escaneo Completo',
    'agents.marketsScanned': 'Mercados escaneados',
    'agents.scanError': 'Error en Escaneo',
    'agents.noMarkets': 'No hay mercados disponibles',
    'agents.predictionHistory': 'Historial de Predicciones',
    'agents.noPredictions': 'Sin predicciones aún',
    'agents.startAnalyzing': 'Comienza a analizar mercados para ver tu historial',
    'agents.configTitle': 'Configuración del Agente',
    'agents.configDescription': 'Configura los ajustes de tu agente de trading IA',
    'agents.agentName': 'Nombre del Agente',
    'agents.model': 'Modelo IA',
    'agents.categories': 'Categorías a Analizar',
    'agents.riskTolerance': 'Tolerancia al Riesgo',
    'agents.conservative': 'Conservador',
    'agents.medium': 'Medio',
    'agents.aggressive': 'Agresivo',
    'agents.analysisDepth': 'Profundidad de Análisis',
    'agents.quick': 'Rápido',
    'agents.balanced': 'Balanceado',
    'agents.deep': 'Profundo',
    'agents.saveConfig': 'Guardar Configuración',
    'agents.configSaved': 'Configuración Guardada',
    'agents.configSavedDesc': 'Los ajustes del agente han sido actualizados',
    'agents.configError': 'Error al guardar configuración',
    'agents.sentiment': 'Sentimiento',
    'agents.sentimentAnalysis': 'Análisis de Sentimiento',
    'agents.analyzingSentiment': 'Analizando sentimiento...',
    'agents.sentimentAnalyzed': 'Sentimiento Analizado',
    'agents.clickAnalyzeSentiment': 'Haz clic en Analizar para escanear noticias y sentimiento social',
    'agents.newsSummary': 'Resumen de Noticias',
    'agents.sources': 'Fuentes',
    'agents.sentimentHistory': 'Historial de Sentimiento',
    'agents.noSentimentHistory': 'Sin datos de sentimiento aún',
    'agents.configureAgent': 'Configurar Agente',
    // Header
    'header.search': 'Buscar mercados, wallets...',
    'header.live': 'En vivo',
    'header.disconnected': 'Desconectado',
    
    // Market Radar
    'radar.title': 'Radar de Posiciones',
    'radar.subtitle': 'Vista general en tiempo real',
    'radar.volume24h': 'Volumen 24h',
    'radar.activeMarkets': 'Mercados Activos',
    'radar.topMover': 'Mayor Movimiento (24h)',
    'radar.avgLiquidity': 'Liquidez Promedio',
    'radar.showing': 'Mostrando',
    'radar.markets': 'mercados',
    'radar.loadMore': 'Cargar más mercados',
    'radar.noMarkets': 'Aún no hay mercados disponibles.',
    'radar.failedLoad': 'Error al cargar mercados',
    'radar.retry': 'Reintentar',
    'radar.loading': 'Cargando...',
    
    // Table headers
    'table.market': 'Mercado',
    'table.price': 'Precio',
    'table.1h': '1h',
    'table.24h': '24h',
    'table.volume': 'Volumen (24h)',
    'table.liquidity': 'Liquidez',
    'table.score': 'Puntuación',
    'table.ends': 'Termina',
    
    // Filters
    'filter.all': 'Todos',
    'filter.topMovers': 'Más Movidos',
    'filter.volume': 'Volumen',
    'filter.liquidity': 'Liquidez',
    'filter.score': 'Puntuación',
    'filter.newest': 'Nuevos',
    
    // Categories
    'cat.politics': 'Política',
    'cat.sports': 'Deportes',
    'cat.crypto': 'Crypto',
    'cat.economics': 'Economía',
    'cat.world': 'Mundo',
    'cat.entertainment': 'Entretenimiento',
    'cat.other': 'Otros',
    
    // Wallet Intel
    'wallet.title': 'Inteligencia de Wallets',
    'wallet.subtitle': 'Rastrea movimientos de dinero inteligente',
    
    // Bot Builder
    'bot.builder.title': 'Constructor de Bot',
    'bot.builder.subtitle': 'Configura tu bot de trading',
    
    // Bot Monitor
    'bot.monitor.title': 'Monitor de Bot',
    'bot.monitor.subtitle': 'Monitorea el rendimiento del bot',
    
    // Common
    'common.unknown': 'Desconocido',
    'common.noData': 'Sin datos',
    'common.loading': 'Cargando...',
    'common.active': 'Activo',
    'common.closed': 'Cerrado',
    'common.showMore': 'Ver más',
    'common.showLess': 'Ver menos',
    
    // Wallet Intel
    'walletIntel.watchlist': 'Lista de Seguimiento',
    'walletIntel.addWallet': 'Añadir Wallet',
    'walletIntel.tracking': 'Siguiendo',
    'walletIntel.wallets': 'wallets',
    'walletIntel.noWallets': 'No hay wallets en seguimiento',
    'walletIntel.totalTrackedVolume': 'Volumen Total Rastreado',
    'walletIntel.watchedWallets': 'Wallets Vigilados',
    'walletIntel.highActivity': 'alta actividad',
    'walletIntel.unusualSignals': 'Señales Inusuales',
    'walletIntel.last24h': 'Últimas 24h',
    'walletIntel.avgWinRate': 'Tasa de Ganancia Prom.',
    'walletIntel.walletActivity': 'Actividad del Wallet',
    'walletIntel.allActivityFeed': 'Feed de Toda la Actividad',
    'walletIntel.noActivity': 'Sin actividad registrada aún',
    'walletIntel.24hVol': 'Vol 24h',
    'walletIntel.winRate': 'Tasa Ganancia',
    'walletIntel.active': 'Activo',
    'walletIntel.unknownWallet': 'Wallet Desconocido',
    'walletIntel.totalVolume': 'Volumen Total',
    'walletIntel.7dVolume': 'Volumen 7d',
    'walletIntel.avgTrade': 'Trade Promedio',
    'walletIntel.markets': 'Mercados',
    'walletIntel.pnl': 'PnL',
    'walletIntel.unusual': 'Inusual',
    'walletIntel.wallet': 'Wallet',
    'walletIntel.unknownMarket': 'Mercado desconocido',
    
    // Market Detail
    'marketDetail.title': 'Detalle de Mercado',
    'marketDetail.subtitle': 'Trades, orderbook y actividad de wallets',
    'marketDetail.selectMarket': 'Selecciona un mercado',
    'marketDetail.goToRadar': 'Ve a Radar de Mercado y haz clic en un mercado para ver sus detalles.',
    'marketDetail.loadingMarket': 'Cargando mercado...',
    'marketDetail.errorLoading': 'No se pudo cargar el mercado seleccionado.',
    'marketDetail.addToBot': 'Añadir al Bot',
    'marketDetail.orderBook': 'Libro de Órdenes',
    'marketDetail.netFlow1h': 'Flujo Neto (1h)',
    'marketDetail.netFlow': 'Flujo Neto',
    'marketDetail.tradesHistory': 'Historial',
    'marketDetail.recentTrades': 'Trades Recientes',
    'marketDetail.noTradesInPeriod': 'Sin trades en este período',
    'marketDetail.loadingTrades': 'Cargando trades...',
    'marketDetail.noTrades': 'Aún no hay trades guardados para este mercado.',
    'marketDetail.relatedNews': 'Noticias Relacionadas',
    'marketDetail.loadingNews': 'Cargando noticias...',
    'marketDetail.noNews': 'No hay noticias recientes',
    'marketDetail.marketStats': 'Estadísticas del Mercado',
    'marketDetail.24hVolume': 'Volumen 24h',
    'marketDetail.liquidity': 'Liquidez',
    'marketDetail.liquidityScore': 'Puntuación Liquidez',
    'marketDetail.endDate': 'Fecha de Fin',
    'marketDetail.fetchingFresh': 'Obteniendo trades frescos...',
    
    // Trades
    'trade.buy': 'COMPRA',
    'trade.sell': 'VENTA',
    'trade.whale': 'BALLENA',
    'trade.big': 'GRANDE',
    
    // Orderbook
    'orderbook.loading': 'Cargando libro de órdenes...',
    'orderbook.retry': 'Reintentar',
    'orderbook.noOrders': 'No hay órdenes disponibles',
    'orderbook.price': 'Precio',
    'orderbook.size': 'Tamaño',
    'orderbook.spread': 'Spread',
    'orderbook.updated': 'Actualizado',
    'orderbook.refresh': 'Actualizar',
    'orderbook.lowLiquidity': 'Baja liquidez',
    
    // Depth Chart
    'depthChart.loading': 'Cargando gráfico de profundidad...',
    'depthChart.noData': 'Sin datos de profundidad',
    'depthChart.bids': 'Compras',
    'depthChart.asks': 'Ventas',
    'depthChart.price': 'Precio',
    'depthChart.combined': 'Profundidad Combinada',
    
    // Wallet Detail Panel
    'wallet.details': 'Detalles del Wallet',
    'wallet.copyAddress': 'Copiar dirección',
    'wallet.viewOnPolygonscan': 'Ver en Polygonscan',
    'wallet.watch': 'Vigilar',
    'wallet.unwatch': 'Dejar de vigilar',
    'wallet.volume24h': 'Volumen 24h',
    'wallet.volume7d': 'Volumen 7d',
    'wallet.totalVolume': 'Volumen Total',
    'wallet.avgTradeSize': 'Tamaño Prom. Trade',
    'wallet.marketsTraded': 'Mercados Operados',
    'wallet.winRate': 'Tasa de Ganancia',
    'wallet.noData': 'Sin datos del wallet',
    'wallet.recentActivity': 'Actividad Reciente',
    'wallet.noActivity': 'Sin actividad registrada',
    'wallet.unusual': 'Inusual',
    'wallet.unknownMarket': 'Mercado desconocido',
  },
};

// Outcome translations (Yes/No and common outcomes)
const outcomeTranslations: Record<Language, Record<string, string>> = {
  en: {
    'Yes': 'Yes',
    'No': 'No',
    'Draw': 'Draw',
    'Other': 'Other',
    'N/A': 'N/A',
  },
  es: {
    'Yes': 'Sí',
    'No': 'No',
    'Draw': 'Empate',
    'Other': 'Otro',
    'N/A': 'N/D',
  },
};

// Category keyword translations
const categoryKeywordTranslations: Record<string, Record<Language, string>> = {
  // Politics
  'Presidential': { en: 'Presidential', es: 'Presidencial' },
  'Election': { en: 'Election', es: 'Elección' },
  'Winner': { en: 'Winner', es: 'Ganador' },
  'Nominee': { en: 'Nominee', es: 'Nominado' },
  'Prime Minister': { en: 'Prime Minister', es: 'Primer Ministro' },
  'Senate': { en: 'Senate', es: 'Senado' },
  'House': { en: 'House', es: 'Cámara' },
  'Midterms': { en: 'Midterms', es: 'Elecciones Intermedias' },
  'Speaker': { en: 'Speaker', es: 'Presidente de la Cámara' },
  'Cabinet': { en: 'Cabinet', es: 'Gabinete' },
  'Republican': { en: 'Republican', es: 'Republicano' },
  'Democratic': { en: 'Democratic', es: 'Demócrata' },
  'Primary': { en: 'Primary', es: 'Primaria' },
  
  // Sports
  'Champion': { en: 'Champion', es: 'Campeón' },
  'MVP': { en: 'MVP', es: 'MVP' },
  'Rookie': { en: 'Rookie', es: 'Novato' },
  'Coach': { en: 'Coach', es: 'Entrenador' },
  'Player': { en: 'Player', es: 'Jugador' },
  'Super Bowl': { en: 'Super Bowl', es: 'Super Bowl' },
  'World Cup': { en: 'World Cup', es: 'Copa del Mundo' },
  'halftime': { en: 'halftime', es: 'medio tiempo' },
  'perform': { en: 'perform', es: 'actuará' },
  
  // Common phrases
  'Which party': { en: 'Which party', es: 'Qué partido' },
  'will win': { en: 'will win', es: 'ganará' },
  'by': { en: 'by', es: 'para' },
  'in': { en: 'in', es: 'en' },
  'of the Year': { en: 'of the Year', es: 'del Año' },
  'Next': { en: 'Next', es: 'Próximo' },
  'How many': { en: 'How many', es: 'Cuántos' },
  'How much': { en: 'How much', es: 'Cuánto' },
  'What will': { en: 'What will', es: 'Qué' },
  'Will': { en: 'Will', es: '¿' },
  'Which': { en: 'Which', es: 'Cuál' },
  'countries': { en: 'countries', es: 'países' },
  'qualify': { en: 'qualify', es: 'clasifican' },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app-language');
    return (saved === 'es' || saved === 'en') ? saved : 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app-language', lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  // Translate outcomes like Yes/No
  const translateOutcome = (outcome: string): string => {
    if (language === 'en') return outcome;
    return outcomeTranslations[language][outcome] || outcome;
  };

  // Translate category names using keyword replacement
  const translateCategory = (category: string): string => {
    if (language === 'en' || !category) return category || t('common.unknown');
    
    let translated = category;
    for (const [keyword, translations] of Object.entries(categoryKeywordTranslations)) {
      if (translated.includes(keyword)) {
        translated = translated.replace(new RegExp(keyword, 'gi'), translations[language]);
      }
    }
    return translated;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, translateOutcome, translateCategory }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
